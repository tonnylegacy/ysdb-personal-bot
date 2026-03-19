const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function listFilesRecursive(dirPath, extensions = []) {
  if (!fs.existsSync(dirPath)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath, extensions));
      continue;
    }
    if (!extensions.length || extensions.includes(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function shortDate(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function writePrettyJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function cleanPhone(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

module.exports = {
  ensureDir,
  listFilesRecursive,
  sha1,
  nowIso,
  shortDate,
  writePrettyJson,
  cleanPhone,
  slugify
};
