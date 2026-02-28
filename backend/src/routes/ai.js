/**
 * routes/ai.js
 * GET /ai/analysis/:market_id — AI probability + sentiment for a market
 *
 * Uses OpenAI GPT-4o if OPENAI_API_KEY is set, otherwise returns mock data.
 */

const express = require('express');
const db = require('../db');

const router = express.Router();

/**
 * Mock AI analysis (used when no OPENAI_API_KEY is set)
 */
function mockAnalysis(question) {
  const seed = question.length % 10;
  const prob = 0.35 + seed * 0.03; // deterministic-ish for demo
  const sentiment =
    prob > 0.6 ? 'BULLISH' : prob < 0.45 ? 'BEARISH' : 'NEUTRAL';
  return {
    ai_probability: parseFloat(prob.toFixed(2)),
    summary: `Based on current trends, there is a ${(prob * 100).toFixed(0)}% chance this event occurs. Market sentiment is ${sentiment.toLowerCase()}.`,
    sentiment,
  };
}

/**
 * Real OpenAI analysis
 */
async function openaiAnalysis(question) {
  const OpenAI = require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `You are a prediction market analyst. Given the following YES/NO prediction market question, estimate the probability the outcome is YES (between 0 and 1), and provide a one-sentence summary. Also classify sentiment as BULLISH, BEARISH, or NEUTRAL.

Question: "${question}"

Respond ONLY with valid JSON like:
{"ai_probability": 0.65, "summary": "...", "sentiment": "BULLISH"}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 150,
  });

  const raw = completion.choices[0].message.content.trim();
  // Strip markdown code fences if present
  const json = raw.replace(/^```json\s*|```$/g, '').trim();
  return JSON.parse(json);
}

// GET /ai/analysis/:market_id
router.get('/analysis/:market_id', async (req, res) => {
  try {
    const market = db.getMarketById(req.params.market_id);
    if (!market) return res.status(404).json({ error: 'Market not found' });

    let analysis;
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
      analysis = await openaiAnalysis(market.question);
    } else {
      analysis = mockAnalysis(market.question);
    }

    // Persist ai_probability back to market
    db.updateMarket(market.id, { ai_probability: analysis.ai_probability });

    return res.json({
      market_id: market.id,
      ...analysis,
    });
  } catch (err) {
    console.error('[ai-analysis]', err.message);
    return res.status(500).json({ error: 'AI analysis failed' });
  }
});

module.exports = router;
