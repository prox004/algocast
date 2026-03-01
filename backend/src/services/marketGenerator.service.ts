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
            content: `You are an expert prediction market question generator that creates high-quality binary questions like Polymarket. You analyze tweets and create clear, verifiable YES/NO questions with specific outcomes and deadlines.

━━━ ANALYSIS PROCESS ━━━
1. READ the full tweet carefully
2. IDENTIFY the core claim, prediction, or event mentioned
3. EXTRACT specific entities (companies, people, prices, dates)
4. CREATE a binary question with measurable outcome
5. SET appropriate deadline based on the event type

━━━ QUESTION QUALITY STANDARDS ━━━
✅ GOOD EXAMPLES:
• "Will Bitcoin close above $100,000 on CoinGecko by March 15, 2026?"
• "Will Tesla report Q1 2026 revenue above $25 billion?"
• "Will the Federal Reserve cut interest rates by March 20, 2026?"
• "Will Apple announce a new iPhone model by June 30, 2026?"

❌ BAD EXAMPLES (REJECT THESE):
• "Will @username increase by more than 5%?" (vague subject)
• "Will things get better?" (no measurable outcome)
• "Will the market react?" (subjective, unverifiable)
• "Will someone announce something?" (unnamed entities)

━━━ MANDATORY REQUIREMENTS ━━━
1. Subject must be a SPECIFIC named entity (company name, person's full name, asset ticker)
2. Outcome must be MEASURABLE (price level, percentage, specific event, announcement)
3. Deadline must be EXACT (date + time + timezone)
4. Source must be VERIFIABLE (official website, major financial data provider)
5. Question must start with "Will" and end with "?"

━━━ REJECTION CRITERIA ━━━
Return { "error": "reason" } if the tweet:
• Is a joke, meme, or sarcasm
• Contains only opinions without factual claims
• References unnamed people ("someone", "they", "this person")
• Has no measurable outcome or specific event
• Is about social media engagement (likes, followers, ratios)
• Contains only vague sentiment ("bullish", "bearish", "vibes")

━━━ TIMEFRAME GUIDELINES ━━━
• Breaking news/announcements → 6-24 hours
• Earnings/scheduled events → Use actual event date
• Price predictions → 1-7 days depending on context
• Product launches → Use expected launch date

━━━ OUTPUT FORMAT ━━━
Return ONLY valid JSON:
{
  "question": "Will [SPECIFIC ENTITY] [MEASURABLE OUTCOME] by [EXACT DATE + TIME + TIMEZONE]?",
  "data_source": "Specific verification source (e.g., 'CoinGecko Bitcoin USD price', 'Tesla investor relations')",
  "expiry": "ISO 8601 datetime",
  "ai_probability": 0.0-1.0,
  "confidence": "high | medium | low",
  "reasoning": "Brief explanation of the prediction logic",
  "suggested_action": "buy | sell | hold"
}

OR if rejecting:
{ "error": "specific reason for rejection" }`
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
    console.warn('   Tweet:', request.trend);
    
    // Try to extract meaningful entities from the tweet
    const tweetText = request.trend.toLowerCase();
    let question = '';
    let dataSource = 'twitter_trend_fallback';
    
    // Look for crypto mentions
    const cryptoPatterns = [
      { pattern: /\b(bitcoin|btc)\b/i, name: 'Bitcoin (BTC)', threshold: '$100,000' },
      { pattern: /\b(ethereum|eth)\b/i, name: 'Ethereum (ETH)', threshold: '$4,000' },
      { pattern: /\b(solana|sol)\b/i, name: 'Solana (SOL)', threshold: '$200' },
      { pattern: /\b(cardano|ada)\b/i, name: 'Cardano (ADA)', threshold: '$1.00' },
      { pattern: /\b(dogecoin|doge)\b/i, name: 'Dogecoin (DOGE)', threshold: '$0.50' }
    ];
    
    // Look for stock mentions
    const stockPatterns = [
      { pattern: /\b(tesla|tsla)\b/i, name: 'Tesla (TSLA)', threshold: '$300' },
      { pattern: /\b(apple|aapl)\b/i, name: 'Apple (AAPL)', threshold: '$200' },
      { pattern: /\b(microsoft|msft)\b/i, name: 'Microsoft (MSFT)', threshold: '$400' },
      { pattern: /\b(nvidia|nvda)\b/i, name: 'NVIDIA (NVDA)', threshold: '$800' },
      { pattern: /\b(amazon|amzn)\b/i, name: 'Amazon (AMZN)', threshold: '$150' }
    ];
    
    // Check for crypto matches
    for (const crypto of cryptoPatterns) {
      if (crypto.pattern.test(tweetText)) {
        question = `Will ${crypto.name} close above ${crypto.threshold} on CoinGecko by [DATE]?`;
        dataSource = `CoinGecko ${crypto.name.split('(')[0].trim()} USD price`;
        break;
      }
    }
    
    // Check for stock matches if no crypto found
    if (!question) {
      for (const stock of stockPatterns) {
        if (stock.pattern.test(tweetText)) {
          question = `Will ${stock.name} close above ${stock.threshold} on Yahoo Finance by [DATE]?`;
          dataSource = `Yahoo Finance ${stock.name.split('(')[1].replace(')', '')} closing price`;
          break;
        }
      }
    }
    
    // Generic fallback if no specific entities found
    if (!question) {
      // Extract first few meaningful words, avoiding common Twitter noise
      const words = request.trend
        .replace(/@\w+:?\s*/g, '') // Remove @mentions
        .replace(/https?:\/\/\S+/g, '') // Remove URLs
        .replace(/[^\w\s]/g, ' ') // Remove special chars
        .split(/\s+/)
        .filter(word => word.length > 2 && !['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'man', 'men', 'put', 'say', 'she', 'too', 'use'].includes(word.toLowerCase()))
        .slice(0, 3)
        .join(' ');
      
      if (words.length > 0) {
        question = `Will ${words} result in a significant market movement by [DATE]?`;
      } else {
        question = `Will the current market trend continue by [DATE]?`;
      }
    }
    
    // Set expiry to 24 hours from now
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 1);
    const expiry = expiryDate.toISOString();
    
    // Replace [DATE] placeholder with actual date
    question = question.replace('[DATE]', expiryDate.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    }));
    
    const fallbackMarket: GeneratedMarket = {
      question,
      data_source: dataSource,
      expiry,
      ai_probability: 0.50, // Neutral probability for fallback
      confidence: 'low',
      reasoning: 'Fallback market generated when AI service unavailable. Limited analysis performed.',
      suggested_action: 'hold'
    };
    
    console.log('✅ Fallback market generated:');
    console.log('   Question:', question);
    console.log('   Data Source:', dataSource);
    console.log('   Expiry:', expiry);
    
    return fallbackMarket;
  }
}