const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { config } = require("./config");
const { ensureDir, nowIso } = require("./utils");

let dbInstance;

function getDb() {
  if (!dbInstance) {
    ensureDir(path.dirname(config.databasePath));
    dbInstance = new DatabaseSync(config.databasePath);
    dbInstance.exec("PRAGMA journal_mode = WAL;");
    dbInstance.exec("PRAGMA foreign_keys = ON;");
  }
  return dbInstance;
}

function initDb() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      source_label TEXT DEFAULT '',
      lead_stage TEXT DEFAULT 'new',
      language_code TEXT DEFAULT 'en',
      relationship_warmth REAL DEFAULT 0,
      trading_interest REAL DEFAULT 0,
      ib_candidate_score REAL DEFAULT 0,
      response_likelihood REAL DEFAULT 0,
      objection_summary TEXT DEFAULT '',
      telegram_username TEXT DEFAULT '',
      telegram_chat_id TEXT DEFAULT '',
      opted_in_telegram INTEGER DEFAULT 0,
      opted_out INTEGER DEFAULT 0,
      last_engagement_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_key TEXT NOT NULL UNIQUE,
      contact_id INTEGER NOT NULL,
      source_file TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      summary TEXT DEFAULT '',
      FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_key TEXT NOT NULL UNIQUE,
      conversation_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      sent_at TEXT,
      direction TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      body TEXT NOT NULL,
      raw_line TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      priority INTEGER NOT NULL DEFAULT 2,
      title TEXT NOT NULL,
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS outbound_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER,
      channel TEXT NOT NULL,
      message_type TEXT NOT NULL,
      status TEXT NOT NULL,
      recipient_ref TEXT DEFAULT '',
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS daily_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      result_date TEXT NOT NULL UNIQUE,
      source_ref TEXT DEFAULT '',
      source_text TEXT NOT NULL,
      summary_text TEXT NOT NULL,
      takeaway_text TEXT NOT NULL,
      cta_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bot_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function setState(key, value) {
  getDb().prepare(`
    INSERT INTO bot_state (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), nowIso());
}

function getState(key, fallback = null) {
  const row = getDb().prepare("SELECT value FROM bot_state WHERE key = ?").get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

module.exports = { getDb, initDb, setState, getState };
