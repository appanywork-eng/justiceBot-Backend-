// core/openaiClient.js
// Centralised OpenAI initialisation, reusable everywhere.

const OpenAI = require("openai");

let openai = null;

function initOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY not set; fallback mode active.");
    return;
  }
  try {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("OpenAI client initialised");
  } catch (err) {
    console.error("Error initialising OpenAI client:", err);
    openai = null;
  }
}

// Initialise immediately on startup
initOpenAI();

function getOpenAI() {
  return openai;
}

function isOpenAIReady() {
  return !!openai;
}

module.exports = {
  getOpenAI,
  isOpenAIReady,
};
