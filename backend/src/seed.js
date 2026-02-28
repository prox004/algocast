/**
 * seed.js — Pre-loads curated prediction market questions into the in-memory DB.
 * Called once at server startup (before any routes are served).
 *
 * These markets are seeded without on-chain contracts; app_id / ASA IDs are
 * populated later if contracts/deploy.py is run for each question.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const SEED_MARKETS = [
  {
    question: 'Will Bitcoin (BTC/USD) close above $75,000 on June 30, 2026 at 23:59 UTC?',
    expiry: Math.floor(new Date('2026-06-30T23:59:00Z').getTime() / 1000),
    data_source: 'CoinGecko daily closing price',
    ai_probability: 0.52,
  },
  {
    question: 'Will Ethereum (ETH/USD) trade above $5,000 at any time before September 30, 2026 at 23:59 UTC?',
    expiry: Math.floor(new Date('2026-09-30T23:59:00Z').getTime() / 1000),
    data_source: 'Coinbase spot price chart',
    ai_probability: 0.44,
  },
  {
    question: 'Will the S&P 500 close above 5,500 on December 31, 2026?',
    expiry: Math.floor(new Date('2026-12-31T21:00:00Z').getTime() / 1000),
    data_source: 'Official S&P 500 closing price',
    ai_probability: 0.55,
  },
  {
    question: 'Will the U.S. Federal Reserve increase interest rates at its July 2026 meeting?',
    expiry: Math.floor(new Date('2026-07-31T23:59:00Z').getTime() / 1000),
    data_source: 'Federal Reserve official statement',
    ai_probability: 0.30,
  },
  {
    question: 'Will U.S. CPI inflation for August 2026 exceed 4.0% year-over-year?',
    expiry: Math.floor(new Date('2026-09-30T23:59:00Z').getTime() / 1000),
    data_source: 'Bureau of Labor Statistics CPI release',
    ai_probability: 0.25,
  },
  {
    question: 'Will OpenAI release a new flagship model before September 30, 2026 at 23:59 UTC?',
    expiry: Math.floor(new Date('2026-09-30T23:59:00Z').getTime() / 1000),
    data_source: 'Official OpenAI announcement',
    ai_probability: 0.72,
  },
  {
    question: 'Will Apple announce a new AR/VR hardware product before December 31, 2026 at 23:59 UTC?',
    expiry: Math.floor(new Date('2026-12-31T23:59:00Z').getTime() / 1000),
    data_source: 'Apple official press release',
    ai_probability: 0.60,
  },
  {
    question: 'Will Tesla launch a fully autonomous taxi service in any U.S. city before December 31, 2026 at 23:59 UTC?',
    expiry: Math.floor(new Date('2026-12-31T23:59:00Z').getTime() / 1000),
    data_source: 'Official Tesla announcement',
    ai_probability: 0.35,
  },
  {
    question: 'Will a Category 4 or higher hurricane make landfall in the U.S. before October 1, 2026?',
    expiry: Math.floor(new Date('2026-10-01T23:59:00Z').getTime() / 1000),
    data_source: 'National Hurricane Center official reports',
    ai_probability: 0.48,
  },
  {
    question: 'Will gold (XAU/USD) close above $2,500 on December 31, 2026?',
    expiry: Math.floor(new Date('2026-12-31T23:59:00Z').getTime() / 1000),
    data_source: 'Official market closing price',
    ai_probability: 0.58,
  },
  {
    question: 'Will the 2026 FIFA World Cup Final be decided in extra time or penalties?',
    expiry: Math.floor(new Date('2026-07-31T23:59:00Z').getTime() / 1000),
    data_source: 'Official FIFA match result',
    ai_probability: 0.42,
  },
  {
    question: 'Will any film released in 2026 gross over $1.5 billion worldwide?',
    expiry: Math.floor(new Date('2026-12-31T23:59:00Z').getTime() / 1000),
    data_source: 'Box Office Mojo official data',
    ai_probability: 0.50,
  },
  {
    question: 'Will the U.S. unemployment rate fall below 3.5% at any point before December 31, 2026?',
    expiry: Math.floor(new Date('2026-12-31T23:59:00Z').getTime() / 1000),
    data_source: 'Bureau of Labor Statistics release',
    ai_probability: 0.38,
  },
  {
    question: 'Will Brent crude oil close above $95 per barrel on December 31, 2026?',
    expiry: Math.floor(new Date('2026-12-31T23:59:00Z').getTime() / 1000),
    data_source: 'Official Brent crude closing price',
    ai_probability: 0.40,
  },
  {
    question: 'Will a new UK general election be officially announced before July 1, 2027?',
    expiry: Math.floor(new Date('2027-07-01T23:59:00Z').getTime() / 1000),
    data_source: 'UK government official announcement',
    ai_probability: 0.65,
  },
];

function seedMarkets() {
  const existing = new Set(db.getAllMarkets().map((m) => m.question));
  let seeded = 0;

  for (const m of SEED_MARKETS) {
    if (existing.has(m.question)) continue; // skip if already present

    db.createMarket({
      id:           uuidv4(),
      question:     m.question,
      expiry:       m.expiry,
      ai_probability: m.ai_probability,
      yes_asa_id:   null,
      no_asa_id:    null,
      yes_reserve:  0,
      no_reserve:   0,
      resolved:     false,
      outcome:      null,
      app_id:       null,
      app_address:  null,
      data_source:  m.data_source,
      ai_advisory:  'HOLD',
      created_by:   'SEED',
      created_at:   Math.floor(Date.now() / 1000),
    });
    seeded++;
  }

  console.log(`[Seed] ${seeded} markets added (${SEED_MARKETS.length - seeded} already existed)`);
}

module.exports = { seedMarkets };
