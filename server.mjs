/*
 * PetitionDesk backend (hybrid version)
 *
 * This server implements the same public API surface as the original
 * PetitionDesk Node.js/Express backend. It is designed to run in both
 * environments with and without third‑party modules installed. When
 * libraries such as express, cors, openai, pdfkit or ioredis are
 * available the server will use them to deliver a feature rich
 * experience. If they are missing, the server gracefully falls back
 * to a minimal HTTP implementation with reduced functionality but
 * identical routes. The intention is to allow this file to be dropped
 * into any deployment without further modification: a fully loaded
 * runtime will benefit from AI drafting, Redis session management and
 * proper PDF rendering, while a constrained runtime will still be
 * able to generate petitions from templates and return PDF‑like
 * documents.
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

// Attempt to import optional dependencies. Each import is wrapped in
// a try/catch so that failure is non‑fatal. Only when the module is
// present will its functionality be used. These variables may
// evaluate to undefined if the import fails.
let expressMod;
let corsMod;
let PDFDocument;
let OpenAI;
let Redis;
let Canvas;
try {
  expressMod = await import('express');
} catch {
  /* express is optional; fallback HTTP server will be used */
}
try {
  corsMod = await import('cors');
} catch {
  /* CORS middleware is optional */
}
try {
  // pdfkit exports its constructor directly; some bundlers wrap it in
  // a default property. Attempt both resolutions.
  const pdfModule = await import('pdfkit');
  PDFDocument = pdfModule.default ?? pdfModule;
} catch {
  /* pdfkit is optional; skia‑canvas or plain text fallback will be used */
}
try {
  // openai module provides a default export in ESM environments
  const openaiModule = await import('openai');
  OpenAI = openaiModule.default ?? openaiModule;
} catch {
  /* openai is optional; petitions will fall back to a template */
}
try {
  const redisModule = await import('ioredis');
  Redis = redisModule.default ?? redisModule;
} catch {
  /* Redis is optional; in‑memory stores will be used */
}
try {
  // skia‑canvas is available globally in the execution environment
  ({ Canvas } = await import('skia-canvas'));
} catch {
  /* Canvas fallback may not be available either */
}

// Optionally load dotenv to populate environment variables from a .env file
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch {
  // ignore if dotenv is not installed
}

// Resolve __dirname in an ES module context. This is used for loading
// local files relative to this script, such as sector catalogs.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration from environment variables with sensible defaults.
// These names match those used in the original backend and can be
// overridden via a .env file or host environment.
const ADMIN_UNLOCK_KEY = process.env.ADMIN_UNLOCK_KEY || '';
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'https://petitiondesk.com';
const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || 1050);
const FLW_SECRET_HASH = process.env.FLW_WEBHOOK_SECRET_HASH || process.env.FLW_SECRET_KEY || '';
const ADMIN_SESSION_TTL_SECONDS = 30 * 60; // 30 minutes

// Oversight email addresses for copying petitions. Defaults to empty
// strings; override via environment variables to enable.
const OVERSIGHT_EMAILS = {
  PCC: process.env.PCC_EMAIL || '',
  NHRC: process.env.NHRC_EMAIL || '',
  FCCPC: process.env.FCCPC_EMAIL || '',
  SERVICOM: process.env.SERVICOM_EMAIL || '',
  AGF: process.env.AGF_EMAIL || '',
};

// In‑memory stores. When Redis is configured these values will be
// mirrored to Redis to support multi‑process deployments. The petition
// store persists generated petitions between API calls. USED_TX_REFS
// prevents reusing transaction references. Metrics counts API usage.
const petitionStore = new Map();
const USED_TX_REFS = new Set();
const metrics = {
  generated: 0,
  previewed: 0,
  paid_attempts: 0,
  paid_success: 0,
  downloaded: 0,
};

// Redis client initialisation. If a REDIS_URL is provided and the
// ioredis module is available, a client will be created. Otherwise
// redisClient remains null and in‑memory storage is used exclusively.
let redisClient = null;
if (Redis && process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    redisClient.on('error', (e) => {
      console.error('Redis error:', e?.message || e);
    });
    redisClient.on('connect', () => {
      console.log('✅ Redis connected');
    });
    // Initiate connection asynchronously; errors are handled via events
    redisClient.connect().catch(() => {});
  } catch (e) {
    console.error('Redis init error:', e?.message || e);
    redisClient = null;
  }
}

// Increment a Redis metric if redisClient is available
async function redisIncr(key) {
  if (!redisClient) return;
  try {
    await redisClient.incr(key);
  } catch {
    // ignore redis errors
  }
}

// Admin token store. When Redis is configured tokens are stored in
// Redis with an expiry equal to ADMIN_SESSION_TTL_SECONDS. Otherwise
// they are stored in memory and removed after the TTL expires. The
// createAdminSession function returns a new token for use in API
// requests.
const adminTokens = new Set();

async function createAdminSession() {
  const token = `pdadm_${Date.now()}_${randomToken(24)}`;
  if (redisClient) {
    try {
      await redisClient.set(`pd:admin:${token}`, '1', 'EX', ADMIN_SESSION_TTL_SECONDS);
    } catch {
      // fallback to in‑memory if Redis set fails
      adminTokens.add(token);
      setTimeout(() => adminTokens.delete(token), ADMIN_SESSION_TTL_SECONDS * 1000);
    }
  } else {
    adminTokens.add(token);
    setTimeout(() => adminTokens.delete(token), ADMIN_SESSION_TTL_SECONDS * 1000);
  }
  return token;
}

async function isAdminTokenValid(token) {
  if (!token) return false;
  if (redisClient) {
    try {
      const ok = await redisClient.get(`pd:admin:${token}`);
      return ok === '1';
    } catch {
      // ignore redis errors and fall back to memory
    }
  }
  return adminTokens.has(token);
}

// Utility functions used throughout the API. These are pure helpers
// independent of the web framework and can be shared between the
// Express and fallback implementations.
function randomToken(len = 48) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function safeUniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function isLikelyOfficialEmail(email) {
  if (!isEmail(email)) return false;
  const lower = email.toLowerCase();
  const badDomains = [
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'live.com',
    'aol.com',
    'proton.me',
    'protonmail.com',
  ];
  const domain = lower.split('@')[1] || '';
  if (badDomains.includes(domain)) return false;
  if (lower.startsWith('noreply@') || lower.startsWith('no-reply@')) return false;
  return true;
}

function extractEmailsDeep(value, out = []) {
  if (!value) return out;
  if (typeof value === 'string' && isEmail(value.trim())) out.push(value.trim());
  if (Array.isArray(value)) value.forEach((v) => extractEmailsDeep(v, out));
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach((v) => extractEmailsDeep(v, out));
  }
  return out;
}

function extractSubjectFromPetition(petitionText = '') {
  const m =
    petitionText.match(/^\s*subject\s*:\s*(.+)\s*$/im) ||
    petitionText.match(/^\s*re\s*:\s*(.+)\s*$/im);
  return (m?.[1] || '').trim() || 'Petition Regarding Complaint';
}

function normalizeName(s = '') {
  return String(s)
    .toLowerCase()
    .replace(/[\u2019’]/g, "'")
    .replace(/[^a-z0-9\s().,&/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadSectorJson(sector) {
  const filePath = path.join(__dirname, 'data', `${sector}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Error loading ${sector}.json:`, e.message);
    return null;
  }
}

// Sector detection based on keywords. If OpenAI or other NLP tools
// become available in future this function can be enhanced.
function detectSector(text) {
  const lower = (text || '').toLowerCase();
  const map = {
    power: ['electricity', 'nepa', 'aedc', 'transformer', 'power', 'disco', 'tcn', 'nberc'],
    aviation: ['flight', 'airport', 'airline', 'ncaa', 'faan', 'aviation'],
    banking: ['bank', 'atm', 'pos', 'debit', 'transfer', 'chargeback', 'unlawful debit'],
    telecoms: ['airtime', 'data', 'network', 'sim', 'telecom', 'ncc', 'mtn', 'airtel', 'glo', '9mobile'],
    education: ['school', 'university', 'waec', 'jamb', 'nuc', 'education', 'tetfund'],
    health: ['hospital', 'clinic', 'doctor', 'ncdc', 'nhis', 'medical', 'health'],
    security: ['police', 'army', 'navy', 'airforce', 'nscdc', 'unlawful arrest', 'immigration'],
    judiciary: ['court', 'judge', 'justice', 'supreme', 'petition', 'magistrate'],
    international_escalation: ['un', 'ecowas', 'au', 'icc', 'eu', 'international'],
  };
  for (const [sec, words] of Object.entries(map)) {
    if (words.some((w) => lower.includes(w))) return sec;
  }
  return 'unknown';
}

async function detectSectorHybrid(text) {
  // In a future version this might call an AI model. For now, it uses
  // keyword matching.
  return detectSector(text);
}

function inferCaseType(sector) {
  if (sector === 'security' || sector === 'judiciary') return 'human_rights';
  if (['health', 'telecoms', 'aviation', 'banking', 'power', 'education'].includes(sector)) return 'service_delivery';
  if (sector === 'international_escalation') return 'international';
  return 'other';
}

function buildAdminOversightCC({ sector, caseType }) {
  const cc = [];
  if (sector !== 'international_escalation' && OVERSIGHT_EMAILS.PCC) cc.push(OVERSIGHT_EMAILS.PCC);
  if (caseType === 'human_rights' && OVERSIGHT_EMAILS.NHRC) cc.push(OVERSIGHT_EMAILS.NHRC);
  if (caseType === 'service_delivery') {
    if (OVERSIGHT_EMAILS.SERVICOM) cc.push(OVERSIGHT_EMAILS.SERVICOM);
    if (OVERSIGHT_EMAILS.FCCPC) cc.push(OVERSIGHT_EMAILS.FCCPC);
  }
  if (sector === 'international_escalation' && OVERSIGHT_EMAILS.AGF) cc.push(OVERSIGHT_EMAILS.AGF);
  return safeUniq(cc).filter(isEmail);
}

function buildInstitutionCatalog(sectorJson) {
  const items = [];
  function addItem(name, obj, isPrimary = false) {
    if (!name) return;
    const emails = safeUniq(extractEmailsDeep(obj)).filter(isLikelyOfficialEmail);
    const primaryNorm = normalizeName(name);
    const aliasNorms = Array.isArray(obj?.aliases)
      ? safeUniq(obj.aliases.map(normalizeName)).filter((n) => n && n !== primaryNorm)
      : [];
    items.push({ name: String(name), norm: primaryNorm, aliasNorms, emails, isPrimary });
  }
  if (!sectorJson || typeof sectorJson !== 'object') return items;
  const currentSector = (sectorJson.sector || '').toLowerCase();
  if (sectorJson.oversight && typeof sectorJson.oversight === 'object') {
    for (const key of Object.keys(sectorJson.oversight)) {
      const node = sectorJson.oversight[key];
      addItem(node?.name || key, node, false);
    }
  }
  ['core_institutions', 'regulators', 'watchdogs', 'players'].forEach((key) => {
    if (Array.isArray(sectorJson[key])) {
      sectorJson[key].forEach((inst) => addItem(inst?.name || inst, inst, false));
    }
  });
  if (
    currentSector === 'aviation' &&
    Array.isArray(sectorJson.airlines_operating_in_nigeria?.domestic_scheduled_airlines)
  ) {
    sectorJson.airlines_operating_in_nigeria.domestic_scheduled_airlines.forEach((inst) =>
      addItem(inst?.name || inst, inst, true),
    );
  }
  if (currentSector === 'banking' && Array.isArray(sectorJson.banks)) {
    sectorJson.banks.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }
  if (
    currentSector === 'telecoms' &&
    Array.isArray(sectorJson.major_operators?.mobile_network_operators)
  ) {
    sectorJson.major_operators.mobile_network_operators.forEach((inst) =>
      addItem(inst?.name || inst, inst, true),
    );
  }
  return items;
}

function findMentionedInstitutions(petitionText, catalog) {
  const textNorm = normalizeName(petitionText);
  const mentioned = [];
  for (const item of catalog) {
    if (!item?.norm) continue;
    if (textNorm.includes(item.norm) || item.aliasNorms?.some((a) => textNorm.includes(a))) {
      mentioned.push(item);
      continue;
    }
    const parts = item.norm.split(' ').filter((p) => p.length >= 4);
    const hits = parts.filter((p) => textNorm.includes(p));
    if (hits.length >= Math.max(1, Math.floor(parts.length / 2))) {
      mentioned.push(item);
    }
  }
  const raw = (petitionText || '').toLowerCase();
  if (raw.includes('police')) {
    mentioned.push(
      ...catalog.filter(
        (c) => c.norm.includes('police') || c.aliasNorms?.some((a) => a.includes('police')),
      ),
    );
  }
  return safeUniq(mentioned);
}

// AI institution picker stub. The original code used the OpenAI API to
// further refine the list of recipient institutions. In the absence
// of network access or the openai module, this function returns an
// empty array. When OpenAI is available and accessible, the function
// calls the API with the provided complaint and petition and the
// catalog of institution names, returning a filtered list of names.
async function aiPickInstitutionsFromCatalog({ complaint, petitionText, catalogNames }) {
  if (!OpenAI || !process.env.OPENAI_API_KEY || !Array.isArray(catalogNames) || catalogNames.length === 0) {
    return [];
  }
  try {
    const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `You are an expert in Nigerian institutions. Return ONLY the exact names from this list that should receive the petition (TO or CC) as a JSON array of strings. If none, return [].\n\nList:\n${catalogNames.join('\n')}`,
        },
        { role: 'user', content: `Complaint: ${complaint}\n\nPetition:\n${petitionText}` },
      ],
    });
    const text = completion.choices?.[0]?.message?.content?.trim() || '[]';
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = [];
    }
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'string' && n.trim()) : [];
  } catch (e) {
    console.error('AI institution picker error:', e?.message || e);
    return [];
  }
}

function mapAiNamesToCatalogItems(aiNames, catalog) {
  const normMap = new Map();
  for (const item of catalog) {
    if (item.norm) normMap.set(item.norm, item);
    for (const alias of item.aliasNorms || []) normMap.set(alias, item);
  }
  const result = [];
  for (const name of aiNames) {
    const norm = normalizeName(name);
    const item = normMap.get(norm);
    if (item && !result.includes(item)) result.push(item);
  }
  return result;
}

// Payment helper. In environments without network access or when the
// Flutterwave secret key is missing, we simulate a successful response
// by returning a link back to the frontend. In a real deployment
// process.env.FLW_SECRET_KEY must be set and the fetch API will
// contact Flutterwave to generate a payment link.
async function flwFetch(url, options = {}) {
  if (!process.env.FLW_SECRET_KEY) {
    throw new Error('FLW_SECRET_KEY missing');
  }
  // Node 18+ includes a global fetch implementation
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function initiateFlutterwavePayment(payload) {
  // Always use the Flutterwave API when a secret key exists; otherwise
  // return a mock payment link. This preserves compatibility with
  // production environments while allowing local testing.
  if (process.env.FLW_SECRET_KEY) {
    const { ok, data } = await flwFetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return { ok, data };
  }
  // Mock response when FLW_SECRET_KEY is not set
  const txRef = payload?.tx_ref || `mock_${Date.now()}`;
  return {
    ok: true,
    status: 200,
    data: {
      status: 'success',
      data: {
        link: `${FRONTEND_BASE_URL}/mock-payment?tx_ref=${txRef}`,
      },
    },
  };
}

// Petition generator. This function uses the OpenAI API when
// available and configured to draft a professional petition letter. If
// OpenAI is unavailable or an error occurs, it falls back to a
// template that incorporates the complaint and petitioner details.
async function generatePetitionLetter(complaint, petitioner, sector, caseType) {
  const pName = petitioner.fullName?.trim() || '[Your Full Name]';
  const pAddress = petitioner.address?.trim() || '[Your Address]';
  const pEmail = petitioner.email?.trim() || '[Your Email]';
  const pPhone = petitioner.phone?.trim() || '[Phone Number]';
  const autoDate = new Date().toLocaleDateString('en-GB');
  if (OpenAI && process.env.OPENAI_API_KEY) {
    try {
      const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openaiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Draft a professional Nigerian petition letter.\nMANDATORY FORMAT:\nDate: ${autoDate}\nPETITIONER DETAILS:\nName: ${pName}\nAddress: ${pAddress}\nEmail: ${pEmail}\nPhone: ${pPhone}\n\nTO: [Primary institution]\nCC: [Oversight bodies]\n\nSUBJECT: [Clear subject]\n\nFACTS: [Numbered]\n\nLEGAL FRAMEWORK: [Relevant laws]\n\nRELIEFS SOUGHT: [Numbered]\n\nSIGNATURE:\n${pName}\n${pPhone}\n\nSector: ${sector} | Case: ${caseType}`,
          },
          { role: 'user', content: `Complaint: ${complaint}` },
        ],
      });
      const petitionText = completion.choices?.[0]?.message?.content?.trim();
      if (petitionText) return petitionText;
    } catch (e) {
      console.error('OpenAI generation error:', e?.message || e);
      // Fall through to template
    }
  }
  // Fallback template when OpenAI is unavailable or fails
  const templateLines = [];
  templateLines.push(`Date: ${autoDate}`);
  templateLines.push('');
  templateLines.push('PETITIONER DETAILS:');
  templateLines.push(`Name: ${pName}`);
  templateLines.push(`Address: ${pAddress}`);
  templateLines.push(`Email: ${pEmail}`);
  templateLines.push(`Phone: ${pPhone}`);
  templateLines.push('');
  templateLines.push('TO: [Primary institution]');
  templateLines.push('CC: [Oversight bodies]');
  templateLines.push('');
  templateLines.push('SUBJECT: Petition Regarding Your Complaint');
  templateLines.push('');
  templateLines.push('FACTS:');
  const factLines = complaint
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => `${idx + 1}. ${line}`);
  if (factLines.length === 0) {
    factLines.push(`1. ${complaint.trim()}`);
  }
  templateLines.push(...factLines);
  templateLines.push('');
  templateLines.push('LEGAL FRAMEWORK:');
  templateLines.push('[List any relevant laws or regulations here]');
  templateLines.push('');
  templateLines.push('RELIEFS SOUGHT:');
  templateLines.push('1. [Describe your desired outcome here]');
  templateLines.push('');
  templateLines.push('SIGNATURE:');
  templateLines.push(pName);
  templateLines.push(pPhone);
  templateLines.push('');
  templateLines.push(`Sector: ${sector} | Case: ${caseType}`);
  return templateLines.join('\n');
}

// PDF generation helper. This function accepts an array of lines and
// returns a Buffer containing a PDF file. It attempts to use the
// pdfkit library first, falling back to skia‑canvas if available. If
// neither is available it returns the raw text encoded as UTF‑8. The
// caller must set the Content‑Type header accordingly.
async function generatePdfBuffer(lines) {
  // Use pdfkit when available for high quality PDFs
  if (PDFDocument) {
    return new Promise((resolve, reject) => {
      try {
        const chunks = [];
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        // Title
        doc.fontSize(20).text('PETITION LETTER', { align: 'center' });
        doc.moveDown(2);
        // Body
        for (const line of lines) {
          if (line.trim() === '') doc.moveDown();
          else doc.fontSize(12).text(line);
        }
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
  // Use skia‑canvas when available
  if (Canvas) {
    const width = 595; // A4 width in points
    const height = Math.max(842, 100 + lines.length * 20);
    const canvas = new Canvas(width, height, 'pdf');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.font = '12px Arial';
    let y = 50;
    for (const line of lines) {
      if (line.trim() === '') y += 20;
      else {
        ctx.fillText(line, 50, y);
        y += 20;
      }
    }
    const buffer = await canvas.toBuffer();
    return buffer;
  }
  // Fallback: return plain text as the PDF content
  return Buffer.from(lines.join('\n'), 'utf8');
}

// Main server setup function. Determines whether Express is available
// and starts the appropriate server implementation. This function is
// executed at the bottom of the file.
async function startServer() {
  if (expressMod && expressMod.default) {
    // EXPRESS IMPLEMENTATION
    const express = expressMod.default;
    const app = express();
    // Apply JSON parser with 5MB limit and store raw body for
    // signature verification on webhooks
    app.use(
      express.json({
        limit: '5mb',
        verify: (req, res, buf) => {
          req.rawBody = buf;
        },
      }),
    );
    // Enable CORS if cors middleware is available
    if (corsMod && corsMod.default) {
      app.use(corsMod.default({ origin: '*' }));
    }
    // /admin-unlock
    app.post('/admin-unlock', async (req, res) => {
      const { key } = req.body || {};
      if (!key || key !== ADMIN_UNLOCK_KEY) {
        return res.status(401).json({ error: 'Invalid admin key' });
      }
      const token = await createAdminSession();
      return res.json({ success: true, token });
    });
    // /generate-petition
    app.post('/generate-petition', async (req, res) => {
      try {
        const { complaint = '', petitioner = {} } = req.body || {};
        if (!complaint.trim()) {
          return res.status(400).json({ error: 'Complaint is required' });
        }
        metrics.generated += 1;
        await redisIncr('pd:metrics:generated');
        const sector = await detectSectorHybrid(complaint);
        if (sector === 'unknown') {
          return res.status(400).json({ error: 'Could not detect sector' });
        }
        const caseType = inferCaseType(sector);
        const petitionText = await generatePetitionLetter(complaint, petitioner, sector, caseType);
        const subject = extractSubjectFromPetition(petitionText);
        const sectorJson = loadSectorJson(sector);
        const catalog = buildInstitutionCatalog(sectorJson);
        let mentioned = findMentionedInstitutions(petitionText, catalog);
        let primary = mentioned.filter((i) => i.isPrimary);
        let nonPrimary = mentioned.filter((i) => !i.isPrimary);
        let toEmails = safeUniq(primary.flatMap((m) => m.emails)).filter(isLikelyOfficialEmail);
        let ccEmails = safeUniq(nonPrimary.flatMap((m) => m.emails)).filter(isLikelyOfficialEmail);
        ccEmails = safeUniq([...ccEmails, ...buildAdminOversightCC({ sector, caseType })]);
        if (toEmails.length === 0 && nonPrimary.length > 0) {
          toEmails = safeUniq(nonPrimary.flatMap((m) => m.emails)).filter(isLikelyOfficialEmail);
        }
        if (mentioned.length === 0 && catalog.length > 0) {
          const catalogNames = catalog.map((x) => x.name).filter(Boolean);
          const aiNames = await aiPickInstitutionsFromCatalog({ complaint, petitionText, catalogNames });
          if (aiNames.length > 0) {
            const aiItems = mapAiNamesToCatalogItems(aiNames, catalog);
            if (aiItems.length > 0) {
              mentioned = aiItems;
              primary = aiItems.filter((i) => i.isPrimary);
              nonPrimary = aiItems.filter((i) => !i.isPrimary);
              toEmails = safeUniq(primary.flatMap((m) => m.emails)).filter(isLikelyOfficialEmail);
              ccEmails = safeUniq(nonPrimary.flatMap((m) => m.emails)).filter(isLikelyOfficialEmail);
              ccEmails = safeUniq([...ccEmails, ...buildAdminOversightCC({ sector, caseType })]);
              if (toEmails.length === 0 && nonPrimary.length > 0) {
                toEmails = safeUniq(nonPrimary.flatMap((m) => m.emails)).filter(isLikelyOfficialEmail);
              }
            }
          }
        }
        const tx_ref = `pd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        petitionStore.set(tx_ref, {
          petition: petitionText,
          sector,
          caseType,
          subject,
          mentionedInstitutions: mentioned.map((m) => m.name),
          toEmails,
          ccEmails,
          paymentInitializedAt: null,
          paid: false,
        });
        metrics.previewed += 1;
        await redisIncr('pd:metrics:previewed');
        const preview = petitionText.length > 600 ? `${petitionText.substring(0, 600)}...` : petitionText;
        return res.json({
          needsPayment: true,
          amount: PETITION_PRICE_NGN,
          currency: 'NGN',
          tx_ref,
          preview,
        });
      } catch (err) {
        console.error('Generation error:', err);
        return res.status(500).json({ error: 'Failed to generate petition' });
      }
    });
    // /initiate-payment
    app.post('/initiate-payment', async (req, res) => {
      try {
        const { tx_ref, customer = {} } = req.body || {};
        if (!tx_ref?.trim()) {
          return res.status(400).json({ error: 'tx_ref is required' });
        }
        const petitionData = petitionStore.get(tx_ref);
        if (!petitionData) {
          return res.status(404).json({ error: 'Petition session not found or expired' });
        }
        if (USED_TX_REFS.has(tx_ref)) {
          return res.status(400).json({ error: 'This transaction reference has already been used' });
        }
        if (petitionData.paymentInitializedAt) {
          return res.status(400).json({ error: 'Payment already initialized for this petition' });
        }
        const customerEmail = customer.email?.trim();
        const customerPhone = customer.phone?.trim();
        const customerName = customer.name?.trim() || 'PetitionDesk User';
        if (!customerEmail || !isEmail(customerEmail)) {
          return res.status(400).json({ error: 'Valid customer email is required' });
        }
        const customerObj = { email: customerEmail, name: customerName };
        if (customerPhone) {
          customerObj.phone_number = customerPhone;
        }
        const payload = {
          tx_ref,
          amount: PETITION_PRICE_NGN,
          currency: 'NGN',
          redirect_url: `${FRONTEND_BASE_URL}/payment-success?tx_ref=${tx_ref}`,
          payment_options: 'card,mobilemoney,ussd,banktransfer',
          meta: {
            petition_tx_ref: tx_ref,
            sector: petitionData.sector,
          },
          customer: customerObj,
          customizations: {
            title: 'PetitionDesk - Unlock Your Petition',
            description: 'Payment to access full petition and delivery options',
            logo: 'https://petitiondesk.com/logo.png',
          },
        };
        try {
          const { ok, data } = await initiateFlutterwavePayment(payload);
          if (!ok || data.status !== 'success') {
            console.error('Flutterwave init failed:', data);
            return res.status(502).json({ error: 'Payment initialization failed. Please try again.' });
          }
          petitionData.paymentInitializedAt = Date.now();
          petitionStore.set(tx_ref, petitionData);
          metrics.paid_attempts += 1;
          await redisIncr('pd:metrics:paid_attempts');
          return res.json({ success: true, payment_link: data.data.link, tx_ref });
        } catch (err) {
          console.error('Payment init error:', err);
          return res.status(500).json({ error: 'Internal server error during payment setup' });
        }
      } catch (err) {
        console.error('Init payment error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
    // /flw-webhook
    app.post('/flw-webhook', async (req, res) => {
      const signature = req.headers['verif-hash'];
      if (FLW_SECRET_HASH && (!signature || signature !== FLW_SECRET_HASH)) {
        console.warn('Invalid webhook signature');
        return res.status(401).send('Unauthorized');
      }
      const payload = req.body || {};
      if (payload.event !== 'charge.completed' || payload.data?.status !== 'successful') {
        return res.status(200).send('Ignored');
      }
      const tx_ref = payload.data.tx_ref;
      const amount = payload.data.amount;
      const currency = payload.data.currency;
      if (currency !== 'NGN' || amount !== PETITION_PRICE_NGN) {
        return res.status(200).send('Ignored');
      }
      const petitionData = petitionStore.get(tx_ref);
      if (!petitionData || petitionData.paid) {
        return res.status(200).send('Already processed or not found');
      }
      petitionData.paid = true;
      petitionData.paymentDate = new Date().toISOString();
      petitionData.flw_ref = payload.data.flw_ref;
      petitionStore.set(tx_ref, petitionData);
      USED_TX_REFS.add(tx_ref);
      metrics.paid_success += 1;
      await redisIncr('pd:metrics:paid_success');
      return res.status(200).send('OK');
    });
    // /download-pdf/:tx_ref
    app.get('/download-pdf/:tx_ref', async (req, res) => {
      try {
        const tx_ref = req.params.tx_ref;
        if (!tx_ref) {
          return res.status(400).json({ error: 'tx_ref is required' });
        }
        const petitionData = petitionStore.get(tx_ref);
        if (!petitionData) {
          return res.status(404).json({ error: 'Petition not found or expired' });
        }
        if (!petitionData.paid) {
          return res.status(402).json({ error: 'Payment required to download PDF' });
        }
        const lines = petitionData.petition.split('\n');
        const buffer = await generatePdfBuffer(lines);
        metrics.downloaded += 1;
        await redisIncr('pd:metrics:downloaded');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Petition_${tx_ref}.pdf"`);
        return res.end(buffer);
      } catch (err) {
        console.error('PDF generation error:', err);
        return res.status(500).json({ error: 'Failed to generate PDF' });
      }
    });
    // Catch all for unhandled routes
    app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });
    // Start the Express server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`PetitionDesk backend running on port ${PORT}`);
      console.log(`Webhook URL: ${process.env.RENDER_EXTERNAL_URL || 'https://your-app.onrender.com'}/flw-webhook`);
    });
  } else {
    // FALLBACK HTTP IMPLEMENTATION
    // This branch mimics the Express routes using Node's http module.
    console.warn('Express is not available; using fallback HTTP server with limited functionality');
    const server = http.createServer(async (req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
      const pathname = parsedUrl.pathname;
      let bodyData = '';
      req.on('data', (chunk) => {
        bodyData += chunk;
        if (bodyData.length > 5 * 1024 * 1024) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload too large' }));
          req.destroy();
        }
      });
      req.on('end', async () => {
        try {
          // Helper to parse JSON body
          let jsonBody;
          try {
            jsonBody = bodyData ? JSON.parse(bodyData) : {};
          } catch {
            jsonBody = {};
          }
          // /admin-unlock
          if (req.method === 'POST' && pathname === '/admin-unlock') {
            const { key } = jsonBody || {};
            if (!key || key !== ADMIN_UNLOCK_KEY) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid admin key' }));
              return;
            }
            const token = await createAdminSession();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, token }));
            return;
          }
          // /generate-petition
          if (req.method === 'POST' && pathname === '/generate-petition') {
            const complaint = (jsonBody.complaint || '').trim();
            const petitioner = jsonBody.petitioner || {};
            if (!complaint) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Complaint is required' }));
              return;
            }
            metrics.generated += 1;
            await redisIncr('pd:metrics:generated');
            const sector = await detectSectorHybrid(complaint);
            if (sector === 'unknown') {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Could not detect sector' }));
              return;
            }
            const caseType = inferCaseType(sector);
            const petitionText = await generatePetitionLetter(complaint, petitioner, sector, caseType);
            const subject = extractSubjectFromPetition(petitionText);
            const sectorJson = loadSectorJson(sector);
            const catalog = buildInstitutionCatalog(sectorJson);
            let mentioned = findMentionedInstitutions(petitionText, catalog);
            let primary = mentioned.filter((i) => i.isPrimary);
            let nonPrimary = mentioned.filter((i) => !i.isPrimary);
            let toEmails = safeUniq(primary.flatMap((m) => m.emails)).filter(isLikelyOfficialEmail);
            let ccEmails = safeUniq(nonPrimary.flatMap((m) => m.emails)).filter(isLikelyOfficialEmail);
            ccEmails = safeUniq([...ccEmails, ...buildAdminOversightCC({ sector, caseType })]);
            if (toEmails.length === 0 && nonPrimary.length > 0) {
              toEmails = safeUniq(nonPrimary.flatMap((m) => m.emails)).filter(isLikelyOfficialEmail);
            }
            if (mentioned.length === 0 && catalog.length > 0) {
              const catalogNames = catalog.map((x) => x.name).filter(Boolean);
              const aiNames = await aiPickInstitutionsFromCatalog({ complaint, petitionText, catalogNames });
              if (aiNames.length > 0) {
                const aiItems = mapAiNamesToCatalogItems(aiNames, catalog);
                if (aiItems.length > 0) {
                  mentioned = aiItems;
                  primary = aiItems.filter((i) => i.isPrimary);
                  nonPrimary = aiItems.filter((i) => !i.isPrimary);
                  toEmails = safeUniq(primary.flatMap((m) => m.emails)).filter(isLikelyOfficialEmail);
                  ccEmails = safeUniq(nonPrimary.flatMap((m) => m.emails)).filter(isLikelyOfficialEmail);
                  ccEmails = safeUniq([...ccEmails, ...buildAdminOversightCC({ sector, caseType })]);
                  if (toEmails.length === 0 && nonPrimary.length > 0) {
                    toEmails = safeUniq(nonPrimary.flatMap((m) => m.emails)).filter(isLikelyOfficialEmail);
                  }
                }
              }
            }
            const tx_ref = `pd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            petitionStore.set(tx_ref, {
              petition: petitionText,
              sector,
              caseType,
              subject,
              mentionedInstitutions: mentioned.map((m) => m.name),
              toEmails,
              ccEmails,
              paymentInitializedAt: null,
              paid: false,
            });
            metrics.previewed += 1;
            await redisIncr('pd:metrics:previewed');
            const preview = petitionText.length > 600 ? `${petitionText.substring(0, 600)}...` : petitionText;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                needsPayment: true,
                amount: PETITION_PRICE_NGN,
                currency: 'NGN',
                tx_ref,
                preview,
              }),
            );
            return;
          }
          // /initiate-payment
          if (req.method === 'POST' && pathname === '/initiate-payment') {
            const { tx_ref, customer = {} } = jsonBody || {};
            if (!tx_ref || typeof tx_ref !== 'string') {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'tx_ref is required' }));
              return;
            }
            const petitionData = petitionStore.get(tx_ref);
            if (!petitionData) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Petition session not found or expired' }));
              return;
            }
            if (USED_TX_REFS.has(tx_ref)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'This transaction reference has already been used' }));
              return;
            }
            if (petitionData.paymentInitializedAt) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Payment already initialized for this petition' }));
              return;
            }
            const customerEmail = customer.email?.trim();
            const customerPhone = customer.phone?.trim();
            const customerName = customer.name?.trim() || 'PetitionDesk User';
            if (!customerEmail || !isEmail(customerEmail)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Valid customer email is required' }));
              return;
            }
            const customerObj = { email: customerEmail, name: customerName };
            if (customerPhone) customerObj.phone_number = customerPhone;
            const payload = {
              tx_ref,
              amount: PETITION_PRICE_NGN,
              currency: 'NGN',
              redirect_url: `${FRONTEND_BASE_URL}/payment-success?tx_ref=${tx_ref}`,
              payment_options: 'card,mobilemoney,ussd,banktransfer',
              meta: {
                petition_tx_ref: tx_ref,
                sector: petitionData.sector,
              },
              customer: customerObj,
              customizations: {
                title: 'PetitionDesk - Unlock Your Petition',
                description: 'Payment to access full petition and delivery options',
                logo: 'https://petitiondesk.com/logo.png',
              },
            };
            try {
              const { ok, data } = await initiateFlutterwavePayment(payload);
              if (!ok || data.status !== 'success') {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Payment initialization failed. Please try again.' }));
                return;
              }
              petitionData.paymentInitializedAt = Date.now();
              petitionStore.set(tx_ref, petitionData);
              metrics.paid_attempts += 1;
              await redisIncr('pd:metrics:paid_attempts');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, payment_link: data.data.link, tx_ref }));
              return;
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Internal server error during payment setup' }));
              return;
            }
          }
          // /flw-webhook
          if (req.method === 'POST' && pathname === '/flw-webhook') {
            const signature = req.headers['verif-hash'];
            if (FLW_SECRET_HASH && (!signature || signature !== FLW_SECRET_HASH)) {
              res.writeHead(401);
              res.end('Unauthorized');
              return;
            }
            const payload = jsonBody;
            if (payload.event !== 'charge.completed' || payload.data?.status !== 'successful') {
              res.writeHead(200);
              res.end('Ignored');
              return;
            }
            const tx_ref = payload.data.tx_ref;
            const amount = payload.data.amount;
            const currency = payload.data.currency;
            if (currency !== 'NGN' || amount !== PETITION_PRICE_NGN) {
              res.writeHead(200);
              res.end('Ignored');
              return;
            }
            const petitionData = petitionStore.get(tx_ref);
            if (!petitionData || petitionData.paid) {
              res.writeHead(200);
              res.end('Already processed or not found');
              return;
            }
            petitionData.paid = true;
            petitionData.paymentDate = new Date().toISOString();
            petitionData.flw_ref = payload.data.flw_ref;
            petitionStore.set(tx_ref, petitionData);
            USED_TX_REFS.add(tx_ref);
            metrics.paid_success += 1;
            await redisIncr('pd:metrics:paid_success');
            res.writeHead(200);
            res.end('OK');
            return;
          }
          // /download-pdf/:tx_ref
          const downloadMatch = pathname.match(/^\/download-pdf\/([^/]+)$/);
          if (req.method === 'GET' && downloadMatch) {
            const tx_ref = downloadMatch[1];
            const petitionData = petitionStore.get(tx_ref);
            if (!petitionData) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Petition not found or expired' }));
              return;
            }
            if (!petitionData.paid) {
              res.writeHead(402, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Payment required to download PDF' }));
              return;
            }
            try {
              const lines = petitionData.petition.split('\n');
              const buffer = await generatePdfBuffer(lines);
              metrics.downloaded += 1;
              await redisIncr('pd:metrics:downloaded');
              res.writeHead(200, {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="Petition_${tx_ref}.pdf"`,
              });
              res.end(buffer);
              return;
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Failed to generate PDF' }));
              return;
            }
          }
          // Unknown route
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });
    });
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`PetitionDesk fallback backend running on port ${PORT}`);
    });
  }
}

// Kick off the server
startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
