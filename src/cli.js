const fs = require("node:fs");
const path = require("node:path");
const { config } = require("./config");
const { initDb } = require("./db");
const { ensureDir, nowIso, writePrettyJson } = require("./utils");
const { ingestWhatsAppInputs } = require("./whatsapp-parser");
const { draftDailyResultFromFile } = require("./daily-results");
const { runSetup } = require("./setup");
const { getLeadBoard, draftInviteMessages, listOpenTasks } = require("./operations");

function bootstrap() {
  ensureDir(config.whatsappImportsDir);
  ensureDir(config.dailyResultsDir);
  ensureDir(config.runtimeDir);
  initDb();
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
      console.log(JSON.stringify(getLeadBoard().map((row) => ({
        ...row,
        trading_interest: row.trading_interest.toFixed(2),
        response_likelihood: row.response_likelihood.toFixed(2),
        ib_candidate_score: row.ib_candidate_score.toFixed(2)
      })), null, 2));
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
