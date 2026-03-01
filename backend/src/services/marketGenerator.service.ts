import { chatCompletion, isGeminiReady } from './gemini';

interface MarketRequest {
  trend: string;
  category: string;
  volume: number;
}

interface GeneratedMarket {
  question: string;
  data_source: string;
  resolution_source?: string;
  expiry: string;
  ai_probability: number;
  confidence: string;
  reasoning: string;
  suggested_action: string;
  error?: string;
}

export class MarketGeneratorService {
  constructor() {
    if (!isGeminiReady()) {
      console.warn('No GEMINI_API_KEY set, using fallback market generation');
    }
  }

  async generateMarket(request: MarketRequest): Promise<GeneratedMarket> {
    if (!isGeminiReady()) {
      return this.generateFallbackMarket(request);
    }

    const prompt = this.buildMarketPrompt(request);
    
    try {
      const content = await chatCompletion([
          {
            role: 'system',
            content: `You are a strict prediction-market question generator. You convert tweets into sharp, verifiable YES/NO questions like Polymarket or Metaculus. You REFUSE to generate vague or unverifiable questions — output an error instead.

━━━ STEP 1 — EXTRACT FACTS (internal only, don't output) ━━━
Answer internally:
1. WHO — full legal name, company name, or ticker? (not "someone", "the person", "they")
2. WHAT — specific price level, announcement, vote, score, or measurable event?
3. WHEN — exact date + timezone the outcome is known?
4. SOURCE — ONE specific public source anyone can check? (website URL pattern, API, official feed)

If ANY of these is missing or ambiguous → return { "error": "<reason>" }

━━━ STEP 2 — QUESTION TEMPLATE ━━━
Always follow this exact pattern:
"Will [FULL NAME / TICKER] [VERB: reach / close above / announce / pass / win / release] [SPECIFIC THRESHOLD OR EVENT] by [DATE, TIME, TIMEZONE]?"

Mandatory rules:
• Subject MUST be a proper noun (person's full name, company name, asset name + ticker)
• Must contain a NUMERIC THRESHOLD or a SPECIFIC NAMED EVENT (not "improve", "change", "react")
• Must have an EXACT DEADLINE with timezone (never "soon", "shortly", "within hours")
• Must be resolvable by checking exactly ONE named source
• Start with "Will"
• Simple English — no jargon (no: bullish, bearish, on-chain, momentum, sentiment, ratio, metrics, whale, hodl, protocol)
• Never use bracket placeholders like [specific action] in the final question

━━━ WHAT TO REJECT — output { "error": "..." } for these ━━━
• Tweet is a joke, meme, sarcasm, or shitpost with no factual claim
• Tweet references unnamed people ("someone", "this guy", "the person")
• Tweet is pure opinion with no measurable prediction ("things are bad", "feeling bullish")
• No verifiable threshold exists ("will things get better?")
• Subject is ambiguous slang or Twitter culture references
• Tweet is about social-media engagement (ratios, likes, followers) — not verifiable via official sources

━━━ RESOLUTION SOURCES (pick ONE per question) ━━━
• Crypto price → "CoinGecko [ASSET] USD price" or "Coinbase [PAIR] spot price"
• Stock price → "Yahoo Finance [TICKER] closing price" or "Google Finance [TICKER]"
• Company news → "official press release on [company].com or Reuters/AP wire"
• Government → "whitehouse.gov, congress.gov, or Reuters/AP"
• Sports → "ESPN.com final score" or official league site
• Election/vote → "official results from [election authority]"
• Regulation → "Federal Register or official regulatory filing"

━━━ EXAMPLES ━━━
Tweet: "BTC pumping hard rn 🚀🚀"
✅ "Will Bitcoin (BTC) close above $100,000 on CoinGecko by March 2, 2026, 11:59 PM UTC?"

Tweet: "Tesla Q4 earnings gonna be insane"
✅ "Will Tesla (TSLA) report Q4 2025 revenue above $30 billion per their official earnings release?"

Tweet: "Hearing the Fed might cut rates this week"
✅ "Will the US Federal Reserve announce an interest rate cut by March 7, 2026, per federalreserve.gov?"

Tweet: "lmao someone ratioed that dude hard"
→ { "error": "no identifiable subject or verifiable event" }

Tweet: "President's Day sales are trash this year 😂"
→ { "error": "subjective opinion with no measurable threshold or named entity" }

Tweet: "vibes are off today ngl"
→ { "error": "no factual claim, no measurable outcome" }

━━━ OUTPUT — valid JSON only, nothing else ━━━
{
  "question": "Will [named entity] [specific action/threshold] by [exact date + timezone]?",
  "data_source": "Exact source name (e.g. 'CoinGecko Bitcoin USD price')",
  "expiry": "ISO 8601",
  "ai_probability": 0.0–1.0,
  "confidence": "high | medium | low",
  "reasoning": "2-3 sentences. Plain English.",
  "suggested_action": "buy | sell | hold"
}

OR if unverifiable:
{ "error": "one-line reason" }`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        { temperature: 0.3, maxOutputTokens: 500 }
      );

      const parsed = JSON.parse(content);

      // If the AI explicitly refused, treat as error
      if (parsed.error) {
        console.warn(`[MarketGenerator] AI rejected tweet: ${parsed.error}`);
        throw new Error(`AI rejected: ${parsed.error}`);
      }

      const market = parsed as GeneratedMarket;
      // Normalise: AI may return resolution_source instead of data_source
      if (!market.data_source && market.resolution_source) {
        market.data_source = market.resolution_source;
      }

      try {
        return this.validateMarket(market);
      } catch (validationError) {
        console.error('Market validation error:', validationError instanceof Error ? validationError.message : validationError);
        // Re-throw vagueness rejections so they fall to fallback
        if (validationError instanceof Error && validationError.message.includes('vague')) {
          throw validationError;
        }
        // Return the market even if validation makes corrections - don't fail
        return market;
      }
    } catch (error) {
      console.error('Error generating market:', error);
      // If it's an auth error, log helpful message
      if (error instanceof Error && error.message.includes('API key')) {
        console.error('⚠️  Gemini API authentication failed. Please check your GEMINI_API_KEY in .env');
      }
      return this.generateFallbackMarket(request);
    }
  }

  private buildMarketPrompt(request: MarketRequest): string {
    const now = new Date();
    const in1Hour = new Date(now.getTime() + 1 * 60 * 60 * 1000);
    const in6Hours = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const in12Hours = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    return `TWEET:
"${request.trend}"

Category: ${request.category}
Current UTC time: ${now.toISOString()}

TIMEFRAME OPTIONS (pick the most appropriate):
• Breaking news → expiry in 6-12h  (between ${in6Hours.toISOString()} and ${in12Hours.toISOString()})
• Scheduled event → expiry in 12-24h (between ${in12Hours.toISOString()} and ${in24Hours.toISOString()})
• Trend / price target → expiry in 24-48h (between ${in24Hours.toISOString()} and ${in48Hours.toISOString()})

INSTRUCTIONS:
1. Identify the SPECIFIC entity and measurable outcome in the tweet.
2. If the tweet is a joke, meme, vague opinion, or references unnamed people → return { "error": "..." }
3. Otherwise, write ONE clear boolean question with a numeric threshold or named event + exact deadline.
4. Name the single source where anyone can verify the answer.
5. Return valid JSON only.`;
  }

  private validateMarket(market: GeneratedMarket): GeneratedMarket {
    // Validate required fields
    if (!market.question || !market.data_source || !market.expiry) {
      throw new Error('Missing required market fields');
    }

    // Validate probability range
    if (market.ai_probability < 0 || market.ai_probability > 1) {
      market.ai_probability = Math.max(0, Math.min(1, market.ai_probability));
    }

    // Validate and fix expiry
    const now = new Date();
    let expiryDate = new Date(market.expiry);
    const isValidDate = !isNaN(expiryDate.getTime());
    
    console.log(`[MarketGenerator] Validating expiry:`, {
      expiry: market.expiry,
      expiry_type: typeof market.expiry,
      isValidDate: isValidDate,
      now: now.toISOString(),
    });

    // If invalid date or in the past, set to 24 hours from now
    if (!isValidDate || expiryDate <= now) {
      if (!isValidDate) {
        console.warn('[MarketGenerator] ⚠️ Invalid expiry format from AI:', market.expiry);
      } else {
        console.warn('[MarketGenerator] ⚠️ Expiry in past:', expiryDate.toISOString());
      }
      const futureExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      market.expiry = futureExpiry.toISOString();
      console.log('[MarketGenerator] ✅ Corrected expiry to:', market.expiry);
    } else {
      console.log(`[MarketGenerator] ✅ Valid expiry: ${expiryDate.toISOString()}`);
    }

    // Ensure question is binary and starts with interrogative
    if (!this.isBinaryQuestion(market.question)) {
      if (!market.question.startsWith('Will')) {
        market.question = `Will ${market.question}`;
      }
      if (!market.question.endsWith('?')) {
        market.question = `${market.question}?`;
      }
    }

    // ── Vagueness filter: reject questions with unverifiable language ──
    const q = market.question.toLowerCase();
    const VAGUE_PATTERNS = [
      /\bthe person\b/,
      /\bsomeone\b/,
      /\bthis guy\b/,
      /\ba (?:us |government |company )?official\b/,
      /\bconsumers\b.*\bavoiding\b/,
      /\bsentiment\b/,
      /\bmomentum\b/,
      /\bon-chain\b/,
      /\bbullish\b/,
      /\bbearish\b/,
      /\bvibes?\b/,
      /\bratio(?:ed|'d)?\b/,
      /\bwhale\b/,
      /\bhodl\b/,
      /\[specific/i,          // bracket placeholders leaked through
      /\[.*action.*\]/i,
      /announce a new project/,  // generic non-specific
      /\bstart avoiding\b/,
      /\bpain of\b/,
    ];
    for (const pat of VAGUE_PATTERNS) {
      if (pat.test(q)) {
        console.warn(`[MarketGenerator] Rejected vague question (matched ${pat}): ${market.question}`);
        throw new Error(`Question is vague (matched: ${pat.source})`);
      }
    }

    // Must contain at least one proper noun indicator (capital letter mid-sentence) or number
    const hasProperNoun = /Will [A-Z][a-z]/.test(market.question);
    const hasNumber = /\d/.test(market.question);
    if (!hasProperNoun && !hasNumber) {
      console.warn(`[MarketGenerator] Rejected: no proper noun or number in question: ${market.question}`);
      throw new Error('Question is vague — no named entity or numeric threshold found');
    }

    return market;
  }

  private isBinaryQuestion(question: string): boolean {
    const binaryIndicators = ['will', 'does', 'is', 'can', 'should', 'has', 'did', 'could', 'would'];
    const lowerQuestion = question.toLowerCase().trim();
    
    // Must start with a question word and end with ?
    const startsCorrectly = binaryIndicators.some(indicator => 
      lowerQuestion.startsWith(indicator + ' ')
    );
    const endsCorrectly = question.trim().endsWith('?');
    
    return startsCorrectly && endsCorrectly;
  }

  private generateFallbackMarket(request: MarketRequest): GeneratedMarket {
    console.warn('⚠️  AI market generation failed. Using fallback market generator.');
    console.warn('   Trend:', request.trend);
    
    // Extract key entities from trend text
    const words = request.trend.split(' ');
    const topic = words.slice(0, Math.min(5, words.length)).join(' ');
    
    // Generate simple, clear yes/no question
    const question = `Will ${topic} increase by more than 5% in the next week?`;
    
    // Set expiry to 7 days from now (safe default)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7);
    const expiry = expiryDate.toISOString();
    
    // Fallback market with safe defaults
    const fallbackMarket: GeneratedMarket = {
      question,
      data_source: 'twitter_trend_fallback',
      expiry,
      ai_probability: 0.50, // Maximum entropy (no bias)
      confidence: 'low', // Acknowledge lower confidence in fallback
      reasoning: 'Fallback market generated when AI service unavailable',
      suggested_action: 'INFORMATIONAL - Market created from trend without AI analysis'
    };
    
    console.log('✅ Fallback market generated:');
    console.log('   Question:', question);
    console.log('   Expiry:', expiry);
    console.log('   Probability:', fallbackMarket.ai_probability);
    
    return fallbackMarket;
  }
}