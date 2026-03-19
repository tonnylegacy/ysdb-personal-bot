const { config } = require("./config");

function requireToken() {
  if (!config.telegramBotToken) throw new Error("TELEGRAM_BOT_TOKEN is required in .env");
}

async function telegramRequest(method, payload = {}) {
  requireToken();
  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || `Telegram API error on ${method}`);
  return data.result;
}

async function getUpdates(offset) {
  return telegramRequest("getUpdates", { timeout: 25, offset, allowed_updates: ["message"] });
}

async function sendMessage(chatId, text) {
  return telegramRequest("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}

module.exports = { getUpdates, sendMessage };
