const fs = require("node:fs");
const path = require("node:path");
const { getDb } = require("./db");
const { config } = require("./config");
const { nowIso, shortDate } = require("./utils");
const { buildResultCta } = require("./message-templates");

async function draftDailyResultFromFile(filePath) {
  const fullPath = path.resolve(filePath || path.join(config.dailyResultsDir, "today.txt"));
  const sourceText = fs.readFileSync(fullPath, "utf8").trim();
  const lines = sourceText.split(/\r?\n/).filter(Boolean);
  const summary = lines[0] || "YSDB Daily Result";
  const takeaway = /loss/i.test(sourceText)
    ? "The key point is discipline and risk control even on tougher sessions."
    : "The key point is process, patience, and disciplined execution rather than hype.";
  const cta = buildResultCta({ lead_stage: "warm_lead" }, config.botOwnerName);
  getDb().prepare(`
    INSERT INTO daily_results (result_date, source_ref, source_text, summary_text, takeaway_text, cta_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(result_date) DO UPDATE SET
      source_ref = excluded.source_ref,
      source_text = excluded.source_text,
      summary_text = excluded.summary_text,
      takeaway_text = excluded.takeaway_text,
      cta_text = excluded.cta_text
  `).run(shortDate(), path.relative(config.root, fullPath), sourceText, summary, takeaway, cta, nowIso());
  return { resultDate: shortDate(), summary, takeaway, cta };
}

function getLatestDailyResult() {
  return getDb().prepare("SELECT * FROM daily_results ORDER BY result_date DESC LIMIT 1").get();
}

module.exports = { draftDailyResultFromFile, getLatestDailyResult };
