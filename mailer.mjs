import fs from "fs";
import path from "path";
import { scrapeVerifiedEmailsFromDomain } from "./scraper.mjs"; // you can rename file if you want

const dataDir = path.resolve("data");

// Extract emails from JSON only (trusted local source)
export async function scrapeEmailsFromJSON(sector) {
  const file = path.join(dataDir, `${sector}.json`);
  if (!fs.existsSync(file)) return [];
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const found = JSON.stringify(json).match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  );
  return [...new Set(found || [])];
}

// Fetch only verified emails from a known official domain
export async function scrapeVerifiedEmailsFromDomain(domain) {
  try {
    const res = await fetch(`https://${domain}`);
    const text = await res.text();

    const emails = text.match(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    );

    const verified = (emails || []).filter(e => e.endsWith(`@${domain}`));
    return [...new Set(verified)];
  } catch (err) {
    console.warn("Domain scrape error:", err.message);
    return [];
  }
}

// Build email draft strictly following your CC policy
export async function buildEmailDraft(complaintText, sector, institutionDomain = "", forceAgf = false) {
  let to = [];
  let cc = [];

  // Domain-based verified institutional scraping
  if (institutionDomain) {
    const domainEmails = await scrapeVerifiedEmailsFromDomain(institutionDomain);
    to = domainEmails;
  }

  // Fallback to JSON if no domain emails found
  if (!to.length) {
    to = await scrapeEmailsFromJSON(sector);
  }

  // Apply CC policy strictly
  if (sector === "security" || sector === "judiciary") {
    if (process.env.NHRC_EMAIL) cc.push(process.env.NHRC_EMAIL);
    if (process.env.PCC_EMAIL) cc.push(process.env.PCC_EMAIL);
  }

  if (sector === "international_escalation" && forceAgf) {
    if (process.env.AGF_EMAIL) cc.push(process.env.AGF_EMAIL);
    if (process.env.NHRC_EMAIL) cc.push(process.env.NHRC_EMAIL);
    if (process.env.PCC_EMAIL) cc.push(process.env.PCC_EMAIL);
  }

  if (["health","telecoms","aviation","banking","power","education"].includes(sector)) {
    if (process.env.FCCPC_EMAIL) cc.push(process.env.FCCPC_EMAIL);
    if (process.env.SERVICOM_EMAIL) cc.push(process.env.SERVICOM_EMAIL);
    if (process.env.PCC_EMAIL) cc.push(process.env.PCC_EMAIL);
  }

  const subject = "Official Petition";
  const body = complaintText;

  const mailto = `mailto:${to.slice(0,10).join(",")}?cc=${encodeURIComponent([...new Set(cc)].join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return { mailto, to, cc: [...new Set(cc)] };
}

// Stable function to launch mail app from frontend
export function launchMailtoLink(mailto) {
  if (!mailto) throw new Error("No mailto link generated");
  return mailto;
}
