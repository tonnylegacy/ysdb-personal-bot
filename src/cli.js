const fs = require("node:fs");
const path = require("node:path");
const { config } = require("./config");
const { getDb, initDb } = require("./db");
const { ensureDir, nowIso, writePrettyJson } = require("./utils");
const { ingestWhatsAppInputs } = require("./whatsapp-parser");
const { buildInviteMessage } = require("./message-templates");
const { draftDailyResultFromFile } = require("./daily-results");
const { runSetup } = require("./setup");

function bootstrap() {
  ensureDir(config.whatsappImportsDir);
  ensureDir(config.dailyResultsDir);
  ensureDir(config.runtimeDir);
  initDb();
}

function getLeadBoard() {
  const rows = getDb().prepare(`
    SELECT id, name, phone, lead_stage, language_code, trading_interest, response_likelihood, ib_candidate_score, last_engagement_at
    FROM contacts
    WHERE contact_key NOT LIKE 'telegram:%'
    ORDER BY
      CASE lead_stage WHEN 'hot_lead' THEN 1 WHEN 'warm_lead' THEN 2 WHEN 'ib_candidate' THEN 3 ELSE 4 END,
      response_likelihood DESC,
      trading_interest DESC
  `).all();
  return rows.map((row) => ({
    ...row,
    trading_interest: Number(row.trading_interest).toFixed(2),
    response_likelihood: Number(row.response_likelihood).toFixed(2),
    ib_candidate_score: Number(row.ib_candidate_score).toFixed(2)
  }));
}

function draftInviteMessages() {
  const rows = getDb().prepare(`
    SELECT id, name, phone, lead_stage, language_code
    FROM contacts
    WHERE contact_key NOT LIKE 'telegram:%' AND opted_out = 0 AND lead_stage IN ('hot_lead', 'warm_lead', 'ib_candidate')
    ORDER BY response_likelihood DESC, trading_interest DESC
  `).all();
  const output = rows.map((contact) => ({
    ...contact,
    invite_message: buildInviteMessage(contact, config.botOwnerName, config.telegramBotUsername)
  }));
  const filePath = path.join(config.runtimeDir, `invite-drafts-${new Date().toISOString().slice(0, 10)}.json`);
  writePrettyJson(filePath, output);
  const insert = getDb().prepare(`
    INSERT INTO outbound_messages (contact_id, channel, message_type, status, recipient_ref, body, created_at)
    VALUES (?, 'whatsapp', 'invite_draft', 'draft', ?, ?, ?)
  `);
  for (const item of output) {
    insert.run(item.id, item.phone || item.name, item.invite_message, nowIso());
  }
  return { filePath, count: output.length };
}

function listOpenTasks() {
  return getDb().prepare(`
    SELECT t.id, c.name, t.type, t.priority, t.title, t.details, t.status
    FROM tasks t
    LEFT JOIN contacts c ON c.id = t.contact_id
    WHERE t.status = 'open'
    ORDER BY t.priority ASC, t.id DESC
  `).all();
}

async function main() {
  bootstrap();
  const [, , command, maybePath] = process.argv;
  switch (command) {
    case "setup":
      console.log(JSON.stringify(runSetup(), null, 2));
      return;
    case "init":
      console.log(`Database ready at ${config.databasePath}`);
      return;
    case "ingest": {
      const results = await ingestWhatsAppInputs(maybePath);
      const reportPath = path.join(config.runtimeDir, `ingest-report-${Date.now()}.json`);
      writePrettyJson(reportPath, results);
      console.log(JSON.stringify({ imported: results.filter((item) => item.imported).length, reportPath }, null, 2));
      return;
    }
    case "leads":
      console.log(JSON.stringify(getLeadBoard(), null, 2));
      return;
    case "draft-invites":
      console.log(JSON.stringify(draftInviteMessages(), null, 2));
      return;
    case "draft-result": {
      const target = maybePath || path.join(config.dailyResultsDir, "today.txt");
      if (!fs.existsSync(target)) throw new Error(`Daily result source not found: ${target}`);
      console.log(JSON.stringify(await draftDailyResultFromFile(target), null, 2));
      return;
    }
    case "tasks":
      console.log(JSON.stringify(listOpenTasks(), null, 2));
      return;
    default:
      console.log("Usage: node src/cli.js <setup|init|ingest|leads|draft-invites|draft-result|tasks> [path]");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
