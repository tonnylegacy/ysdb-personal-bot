const path = require("node:path");
const { getDb } = require("./db");
const { config } = require("./config");
const { nowIso, writePrettyJson } = require("./utils");
const { buildInviteMessage } = require("./message-templates");

function getLeadBoard() {
  const rows = getDb().prepare(`
    SELECT id, name, phone, lead_stage, language_code, trading_interest, response_likelihood, ib_candidate_score,
           objection_summary, last_engagement_at, telegram_username, opted_in_telegram
    FROM contacts
    WHERE contact_key NOT LIKE 'telegram:%'
    ORDER BY
      CASE lead_stage WHEN 'hot_lead' THEN 1 WHEN 'warm_lead' THEN 2 WHEN 'ib_candidate' THEN 3 ELSE 4 END,
      response_likelihood DESC,
      trading_interest DESC
  `).all();
  return rows.map((row) => ({
    ...row,
    trading_interest: Number(row.trading_interest),
    response_likelihood: Number(row.response_likelihood),
    ib_candidate_score: Number(row.ib_candidate_score)
  }));
}

function draftInviteMessages() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, name, phone, lead_stage, language_code
    FROM contacts
    WHERE contact_key NOT LIKE 'telegram:%'
      AND opted_out = 0
      AND lead_stage IN ('hot_lead', 'warm_lead', 'ib_candidate')
    ORDER BY response_likelihood DESC, trading_interest DESC
  `).all();

  const output = rows.map((contact) => ({
    ...contact,
    invite_message: buildInviteMessage(contact, config.botOwnerName, config.telegramBotUsername)
  }));

  const filePath = path.join(config.runtimeDir, `invite-drafts-${new Date().toISOString().slice(0, 10)}.json`);
  writePrettyJson(filePath, output);

  db.prepare("DELETE FROM outbound_messages WHERE message_type = 'invite_draft' AND status = 'draft'").run();
  const insert = db.prepare(`
    INSERT INTO outbound_messages (contact_id, channel, message_type, status, recipient_ref, body, created_at)
    VALUES (?, 'whatsapp', 'invite_draft', 'draft', ?, ?, ?)
  `);
  for (const item of output) {
    insert.run(item.id, item.phone || item.name, item.invite_message, nowIso());
  }

  return { filePath, count: output.length, items: output };
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

function getRecentInvites(limit = 30) {
  return getDb().prepare(`
    SELECT om.id, c.name, om.channel, om.message_type, om.status, om.body, om.created_at
    FROM outbound_messages om
    LEFT JOIN contacts c ON c.id = om.contact_id
    WHERE om.message_type = 'invite_draft'
    ORDER BY om.id DESC
    LIMIT ?
  `).all(limit);
}

function getLatestDailyResult() {
  return getDb().prepare("SELECT * FROM daily_results ORDER BY result_date DESC LIMIT 1").get();
}

function getContactDetail(contactId) {
  const db = getDb();
  const contact = db.prepare(`
    SELECT id, name, phone, source_label, lead_stage, language_code, trading_interest, response_likelihood,
           ib_candidate_score, objection_summary, last_engagement_at, telegram_username, opted_in_telegram, opted_out
    FROM contacts
    WHERE id = ?
  `).get(contactId);
  if (!contact) return null;

  const conversations = db.prepare(`
    SELECT id, source_file, imported_at, summary
    FROM conversations
    WHERE contact_id = ?
    ORDER BY id DESC
  `).all(contactId);

  const messages = db.prepare(`
    SELECT sent_at, direction, sender_name, body
    FROM messages
    WHERE contact_id = ?
    ORDER BY id DESC
    LIMIT 40
  `).all(contactId).reverse();

  const drafts = db.prepare(`
    SELECT id, body, created_at, status
    FROM outbound_messages
    WHERE contact_id = ? AND message_type = 'invite_draft'
    ORDER BY id DESC
    LIMIT 10
  `).all(contactId);

  return { contact, conversations, messages, drafts };
}

function getDashboardData() {
  return {
    leads: getLeadBoard(),
    tasks: listOpenTasks(),
    invites: getRecentInvites(),
    latestResult: getLatestDailyResult()
  };
}

function updateLeadStage(contactId, leadStage) {
  getDb().prepare("UPDATE contacts SET lead_stage = ?, updated_at = ? WHERE id = ?").run(leadStage, nowIso(), contactId);
  return getContactDetail(contactId);
}

function completeTask(taskId) {
  getDb().prepare("UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ?").run(nowIso(), taskId);
  return { ok: true, taskId };
}

module.exports = {
  getLeadBoard,
  draftInviteMessages,
  listOpenTasks,
  getRecentInvites,
  getLatestDailyResult,
  getContactDetail,
  getDashboardData,
  updateLeadStage,
  completeTask
};
