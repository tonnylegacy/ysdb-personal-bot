const fs = require("node:fs");
const path = require("node:path");
const { config } = require("./config");
const { ensureDir } = require("./utils");
const { initDb } = require("./db");

function runSetup() {
  ensureDir(config.whatsappImportsDir);
  ensureDir(config.dailyResultsDir);
  ensureDir(config.runtimeDir);
  ensureDir(path.dirname(config.databasePath));

  const envPath = path.join(config.root, ".env");
  const examplePath = path.join(config.root, ".env.example");
  let envCreated = false;
  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(examplePath, envPath);
    envCreated = true;
  }

  const sampleChat = path.join(config.root, "examples", "sample-whatsapp-chat.txt");
  const sampleResult = path.join(config.root, "examples", "sample-daily-result.txt");
  const targetChat = path.join(config.whatsappImportsDir, "sample-whatsapp-chat.txt");
  const targetResult = path.join(config.dailyResultsDir, "today.txt");
  if (!fs.existsSync(targetChat)) fs.copyFileSync(sampleChat, targetChat);
  if (!fs.existsSync(targetResult)) fs.copyFileSync(sampleResult, targetResult);

  initDb();
  return {
    envCreated,
    envPath,
    databasePath: config.databasePath,
    importsDir: config.whatsappImportsDir,
    dailyResultsDir: config.dailyResultsDir
  };
}

module.exports = { runSetup };
