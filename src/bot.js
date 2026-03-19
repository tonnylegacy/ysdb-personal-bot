const { initDb, getDb, getState, setState } = require("./db");
const { getUpdates, sendMessage } = require("./telegram-api");
const { buildQualificationReply, buildWelcomeMessage } = require("./message-templates");
const { getLatestDailyResult } = require("./daily-results");
const { config } = require("./config");
const { nowIso } = require("./utils");

function ensureTelegramContact(message) {
  const db = getDb();
  const key = `telegram:${message.from.id}`;
  const existing = db.prepare("SELECT id FROM contacts WHERE contact_key = ?").get(key);
  if (existing) {
    db.prepare("UPDATE contacts SET telegram_chat_id = ?, telegram_username = ?, opted_in_telegram = 1, updated_at = ? WHERE id = ?")
      .run(String(message.chat.id), message.from.username || "", nowIso(), existing.id);
    return existing.id;
  }
  const info = db.prepare(`
    INSERT INTO contacts (contact_key, name, telegram_username, telegram_chat_id, opted_in_telegram, lead_stage, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 'new_subscriber', ?, ?)
  `).run(
    key,
    [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || `telegram-${message.from.id}`,
    message.from.username || "",
    String(message.chat.id),
    nowIso(),
    nowIso()
  );
  return Number(info.lastInsertRowid);
}

async function handleMessage(message, contactId) {
  const text = (message.text || "").trim().toLowerCase();
  if (text === "/start") {
    await sendMessage(message.chat.id, buildWelcomeMessage(config.botOwnerName));
    return;
  }
  if (["trader", "beginner", "partner"].includes(text)) {
    const stage = text === "partner" ? "ib_candidate" : "nurture_active";
    getDb().prepare("UPDATE contacts SET lead_stage = ?, updated_at = ? WHERE id = ?").run(stage, nowIso(), contactId);
    await sendMessage(message.chat.id, buildQualificationReply(config.botOwnerName, text));
    return;
  }
  if (text === "daily result") {
    const latest = getLatestDailyResult();
    if (!latest) {
      await sendMessage(message.chat.id, "No daily result is loaded yet.");
      return;
    }
    await sendMessage(message.chat.id, `${latest.summary_text}\n\n${latest.takeaway_text}\n\n${latest.cta_text}`);
    return;
  }
  if (text === "stop") {
    getDb().prepare("UPDATE contacts SET opted_out = 1, updated_at = ? WHERE id = ?").run(nowIso(), contactId);
    await sendMessage(message.chat.id, "Noted. You have been opted out of further updates.");
    return;
  }
  await sendMessage(message.chat.id, "Reply with trader, beginner, partner, daily result, or stop.");
}

async function main() {
  initDb();
  let offset = getState("telegram_offset", 0);
  console.log("Telegram bot polling started.");
  while (true) {
    try {
      const updates = await getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        setState("telegram_offset", offset);
        if (!update.message?.text) continue;
        const contactId = ensureTelegramContact(update.message);
        await handleMessage(update.message, contactId);
      }
    } catch (error) {
      console.error(`[bot] ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
