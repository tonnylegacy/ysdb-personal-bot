const { ysdbProfile } = require("./knowledge/ysdb-profile");

function buildInviteMessage(contact, ownerName, botUsername = "") {
  const firstName = (contact.name || "bro").split(/\s+/)[0];
  const opener = contact.language_code === "en-pidgin"
    ? `How far ${firstName}, na ${ownerName}.`
    : `Hi ${firstName}, it's ${ownerName}.`;
  const bridge = botUsername ? ` Message me on Telegram via @${botUsername}.` : " Message me on Telegram.";
  return `${opener} I remembered our trading chat and wanted to reconnect properly.${bridge} I will guide you personally.`;
}

function buildResultCta(contact, ownerName) {
  const cta = ysdbProfile.personalCtaExamples[contact.lead_stage === "hot_lead" ? 1 : 0];
  return `${cta} - ${ownerName}`;
}

function buildWelcomeMessage(ownerName) {
  return [
    `Welcome. I am ${ownerName}'s personal Telegram assistant.`,
    "I can help with onboarding, daily YSDB result updates, and basic qualification before he replies personally.",
    "Reply with: trader, beginner, partner, daily result, or stop."
  ].join("\n\n");
}

function buildQualificationReply(ownerName, role) {
  if (role === "partner") {
    return `Noted. I will tag you as a potential IB or referral partner so ${ownerName} can review your fit personally.`;
  }
  if (role === "beginner") {
    return "Noted. The focus will be education, risk control, and proper onboarding.";
  }
  return "Noted. I will keep your profile in the trader path and send only relevant updates.";
}

module.exports = {
  buildInviteMessage,
  buildResultCta,
  buildWelcomeMessage,
  buildQualificationReply
};
