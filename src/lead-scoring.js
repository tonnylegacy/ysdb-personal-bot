const { ysdbProfile } = require("./knowledge/ysdb-profile");

function detectLanguage(text) {
  const pidginHints = ["abeg", "dey", "wahala", "how far", "una", "no wahala"];
  const lower = text.toLowerCase();
  return pidginHints.some((hint) => lower.includes(hint)) ? "en-pidgin" : "en";
}

function scoreConversation(messages) {
  const transcript = messages.map((message) => message.body).join("\n").toLowerCase();
  let tradingInterest = 0.2;
  let responseLikelihood = 0.2;
  let warmth = 0.2;
  let ibCandidateScore = 0.05;

  const hotWords = ["join", "deposit", "how much", "start", "signal", "trade copier", "hfm"];
  for (const word of hotWords) {
    if (transcript.includes(word)) {
      tradingInterest += 0.12;
      responseLikelihood += 0.08;
    }
  }

  for (const signal of ysdbProfile.ibSignals) {
    if (transcript.includes(signal)) ibCandidateScore += 0.18;
  }

  if (/\bthanks\b|\bokay\b|\bgood\b/.test(transcript)) warmth += 0.18;
  if (/\bnot interested\b|\bstop\b|\blater\b/.test(transcript)) {
    tradingInterest -= 0.15;
    responseLikelihood -= 0.18;
  }

  tradingInterest = Math.max(0, Math.min(1, tradingInterest));
  responseLikelihood = Math.max(0, Math.min(1, responseLikelihood));
  warmth = Math.max(0, Math.min(1, warmth));
  ibCandidateScore = Math.max(0, Math.min(1, ibCandidateScore));

  let leadStage = "cold";
  if (tradingInterest >= 0.7) leadStage = "hot_lead";
  else if (ibCandidateScore >= 0.45) leadStage = "ib_candidate";
  else if (tradingInterest >= 0.4 || responseLikelihood >= 0.35) leadStage = "warm_lead";

  const objectionSummary = /how much|capital|money/.test(transcript) ? "capital concern" : "";

  return {
    leadStage,
    languageCode: detectLanguage(transcript),
    relationshipWarmth: warmth,
    tradingInterest,
    ibCandidateScore,
    responseLikelihood,
    objectionSummary
  };
}

module.exports = { scoreConversation };
