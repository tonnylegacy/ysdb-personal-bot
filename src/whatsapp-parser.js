const fs = require("node:fs");
const path = require("node:path");
const { getDb } = require("./db");
const { config } = require("./config");
const { cleanPhone, listFilesRecursive, nowIso, sha1 } = require("./utils");
const { scoreConversation } = require("./lead-scoring");

const LINE_PATTERNS = [
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{1,2}:\d{2}(?::\d{2})?)\s-\s([^:]+):\s([\s\S]*)$/,
  /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{1,2}:\d{2}(?::\d{2})?)\]\s([^:]+):\s([\s\S]*)$/
];

function parseLine(line) {
  for (const pattern of LINE_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      return { dateText: match[1], timeText: match[2], senderName: match[3].trim(), body: match[4].trim() };
    }
  }
  return null;
}

function parseTimestamp(dateText, timeText) {
  const parts = dateText.split("/").map(Number);
  if (parts.length !== 3) return null;
  let [a, b, c] = parts;
  if (c < 100) c += 2000;
  const dayFirst = a > 12;
  const day = dayFirst ? a : b;
  const month = dayFirst ? b : a;
  const parsed = new Date(`${c}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${timeText.padStart(5, "0")}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function detectContactName(messages) {
  const counts = new Map();
  for (const message of messages) counts.set(message.senderName, (counts.get(message.senderName) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown contact";
}

function inferPhoneFromName(name) {
  const match = name.match(/\+?\d[\d\s()-]{7,}/);
  return cleanPhone(match ? match[0] : "");
}

function ensureContact(db, name, phone, sourceLabel) {
  const key = sha1(`${name.toLowerCase()}|${phone}`);
  const existing = db.prepare("SELECT id FROM contacts WHERE contact_key = ?").get(key);
  const timestamp = nowIso();
  if (existing) return existing.id;
  const info = db.prepare(`
    INSERT INTO contacts (contact_key, name, phone, source_label, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(key, name, phone, sourceLabel, timestamp, timestamp);
  return Number(info.lastInsertRowid);
}

function summarize(messages, contactName) {
  const first = messages[0]?.body || "";
  const last = messages.at(-1)?.body || "";
  return `${contactName}: started with "${first.slice(0, 60)}", latest message "${last.slice(0, 60)}"`;
}

function saveConversation(db, contactId, sourceLabel, messages, summary, contactName) {
  const conversationKey = sha1(`${sourceLabel}|${messages.length}|${messages[0]?.body || ""}|${messages.at(-1)?.body || ""}`);
  const existing = db.prepare("SELECT id FROM conversations WHERE conversation_key = ?").get(conversationKey);
  if (existing) return existing.id;
  const info = db.prepare(`
    INSERT INTO conversations (conversation_key, contact_id, source_file, imported_at, summary)
    VALUES (?, ?, ?, ?, ?)
  `).run(conversationKey, contactId, sourceLabel, nowIso(), summary);
  const conversationId = Number(info.lastInsertRowid);

  const insertMessage = db.prepare(`
    INSERT OR IGNORE INTO messages (message_key, conversation_id, contact_id, sent_at, direction, sender_name, body, raw_line)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const message of messages) {
    const direction = message.senderName === contactName ? "in" : "out";
    insertMessage.run(
      sha1(`${conversationId}|${message.sentAt}|${message.senderName}|${message.body}`),
      conversationId,
      contactId,
      message.sentAt,
      direction,
      message.senderName,
      message.body,
      message.rawLine
    );
  }

  return conversationId;
}

function saveScore(db, contactId, score, lastEngagementAt) {
  const timestamp = nowIso();
  db.prepare(`
    UPDATE contacts
    SET lead_stage = ?, language_code = ?, relationship_warmth = ?, trading_interest = ?,
        ib_candidate_score = ?, response_likelihood = ?, objection_summary = ?, last_engagement_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    score.leadStage,
    score.languageCode,
    score.relationshipWarmth,
    score.tradingInterest,
    score.ibCandidateScore,
    score.responseLikelihood,
    score.objectionSummary,
    lastEngagementAt,
    timestamp,
    contactId
  );
  db.prepare("DELETE FROM tasks WHERE contact_id = ? AND type = 'manual_followup'").run(contactId);
  db.prepare(`
    INSERT INTO tasks (contact_id, type, status, priority, title, details, created_at, updated_at)
    VALUES (?, 'manual_followup', 'open', ?, ?, ?, ?, ?)
  `).run(
    contactId,
    score.leadStage === "hot_lead" ? 1 : 2,
    score.leadStage === "hot_lead" ? "Reply quickly to this warm lead" : "Review this contact for reactivation",
    score.objectionSummary || "No major objection identified.",
    timestamp,
    timestamp
  );
}

async function ingestWhatsAppFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const messages = [];
  for (const rawLine of lines) {
    const parsed = parseLine(rawLine);
    if (!parsed) continue;
    messages.push({
      senderName: parsed.senderName,
      body: parsed.body,
      sentAt: parseTimestamp(parsed.dateText, parsed.timeText),
      rawLine
    });
  }
  if (!messages.length) return { filePath, imported: false };
  const contactName = detectContactName(messages);
  const phone = inferPhoneFromName(contactName);
  const db = getDb();
  const sourceLabel = path.relative(config.root, filePath);
  const contactId = ensureContact(db, contactName, phone, sourceLabel);
  saveConversation(db, contactId, sourceLabel, messages, summarize(messages, contactName), contactName);
  const score = scoreConversation(messages);
  saveScore(db, contactId, score, messages.at(-1)?.sentAt || null);
  return { filePath, imported: true, contactName, leadStage: score.leadStage, messageCount: messages.length };
}

async function ingestWhatsAppInputs(targetPath) {
  const files = targetPath ? [path.resolve(targetPath)] : listFilesRecursive(config.whatsappImportsDir, [".txt"]);
  const results = [];
  for (const file of files) results.push(await ingestWhatsAppFile(file));
  return results;
}

module.exports = { ingestWhatsAppInputs, ingestWhatsAppFile };
