const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function boolFromEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

loadEnvFile();

const config = {
  root: ROOT,
  whatsappImportsDir: path.join(ROOT, "imports", "whatsapp"),
  dailyResultsDir: path.join(ROOT, "imports", "daily-results"),
  runtimeDir: path.join(ROOT, "data", "runtime"),
  databasePath: path.join(ROOT, "data", "db", "personal-bot.sqlite"),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || "",
  botOwnerName: process.env.BOT_OWNER_NAME || "Tony",
  botPersonaName: process.env.BOT_PERSONA_NAME || process.env.BOT_OWNER_NAME || "Tony",
  botTone: process.env.BOT_TONE || "confident, clear, respectful, never overpromise",
  ollamaUrl: process.env.OLLAMA_URL || "http://127.0.0.1:11434",
  ollamaModel: process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct",
  ysdbResultsChannel: process.env.YSDB_RESULTS_CHANNEL || "@ysdbcommunity",
  enableAutoResultDms: boolFromEnv("ENABLE_AUTO_RESULT_DMS", false),
  adminPort: 8787
};

module.exports = { config };
