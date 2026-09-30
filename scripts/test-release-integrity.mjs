import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function filesBelow(relativeDirectory, extension) {
  const directory = absolute(relativeDirectory);
  const files = [];

  for (const entry of readdirSync(directory)) {
    const relativePath = path.join(relativeDirectory, entry);
    const details = statSync(absolute(relativePath));

    if (details.isDirectory()) {
      files.push(...filesBelow(relativePath, extension));
    } else if (relativePath.endsWith(extension)) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

function localImportSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\bfrom\s*["'](\.{1,2}\/[^"']+)["']/g,
    /\bimport\s*["'](\.{1,2}\/[^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }

  return [...specifiers];
}

function resolvesLocalImport(importer, specifier) {
  const target = path.resolve(path.dirname(absolute(importer)), specifier);
  return [
    target,
    `${target}.mjs`,
    `${target}.js`,
    path.join(target, "index.mjs"),
    path.join(target, "index.js"),
  ].some(existsSync);
}

const packageJson = JSON.parse(
  readFileSync(absolute("package.json"), "utf8")
);

assert.equal(
  packageJson.name,
  "petitiondesk-backend",
  "The release package must use the PetitionDesk service identity."
);
assert.equal(
  packageJson.main,
  "server.mjs",
  "The package entry point must be the production server."
);
assert.equal(
  packageJson.scripts?.["test:release-integrity"],
  "node scripts/test-release-integrity.mjs",
  "The integrity check must have a stable npm command."
);

for (const legacyPath of ["a8Engine.js", "mailer.mjs"]) {
  assert.equal(
    existsSync(absolute(legacyPath)),
    false,
    `${legacyPath} must not remain in the release source.`
  );
}

const runtimeJavaScript = [
  "server.mjs",
  ...filesBelow("lib", ".mjs"),
];

for (const relativePath of runtimeJavaScript) {
  const syntax = spawnSync(
    process.execPath,
    ["--check", absolute(relativePath)],
    { encoding: "utf8" }
  );

  assert.equal(
    syntax.status,
    0,
    `${relativePath} must parse:\n${syntax.stderr || syntax.stdout}`
  );

  const source = readFileSync(absolute(relativePath), "utf8");
  for (const specifier of localImportSpecifiers(source)) {
    assert.equal(
      resolvesLocalImport(relativePath, specifier),
      true,
      `${relativePath} imports missing local module ${specifier}`
    );
  }
}

for (const relativePath of filesBelow("data", ".json")) {
  assert.doesNotThrow(
    () => JSON.parse(readFileSync(absolute(relativePath), "utf8")),
    `${relativePath} must contain valid JSON.`
  );
}

const dockerfile = readFileSync(absolute("Dockerfile"), "utf8");
const copyLines = dockerfile
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => /^COPY\s+/i.test(line));

const copiedSources = new Set();
for (const line of copyLines) {
  assert.doesNotMatch(
    line,
    /^COPY\s+(?:--\S+\s+)*\.\s+\.\s*$/i,
    "The production image must not copy the repository wholesale."
  );

  const tokens = line
    .replace(/^COPY\s+/i, "")
    .split(/\s+/)
    .filter((token) => !token.startsWith("--"));

  assert.ok(tokens.length >= 2, `Unsupported Docker COPY instruction: ${line}`);
  for (const source of tokens.slice(0, -1)) {
    copiedSources.add(source.replace(/\/$/, ""));
  }
}

assert.deepEqual(
  [...copiedSources].sort(),
  ["data", "lib", "package-lock.json", "package.json", "server.mjs"],
  "The production image must contain only declared runtime inputs."
);
assert.match(
  dockerfile,
  /\nUSER\s+node\s*(?:\n|$)/,
  "The production process must run as the non-root node user."
);

console.log(`✅ ${runtimeJavaScript.length} RUNTIME JAVASCRIPT FILES PARSE`);
console.log("✅ ALL RUNTIME LOCAL IMPORTS RESOLVE");
console.log("✅ ALL SECTOR JSON FILES PARSE");
console.log("✅ PRODUCTION CONTAINER USES THE MINIMAL RUNTIME ALLOWLIST");
console.log("✅ PETITIONDESK PACKAGE IDENTITY AND ENTRY POINT ARE CORRECT");
