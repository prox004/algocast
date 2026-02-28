import OpenAI from 'openai';

interface MarketRequest {
  trend: string;
  category: string;
  volume: number;
}

interface GeneratedMarket {
  question: string;
  data_source: string;
  expiry: string;
  ai_probability: number;
  confidence: string;
  reasoning: string;
  suggested_action: string;
}

export class MarketGeneratorService {
  private openai?: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ 
        apiKey,
        baseURL: process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : undefined
      });
    } else {
      console.warn('No AI API key set, using fallback market generation');
    }
  }

  async generateMarket(request: MarketRequest): Promise<GeneratedMarket> {
    if (!this.openai) {
      return this.generateFallbackMarket(request);
    }

    const prompt = this.buildMarketPrompt(request);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENROUTER_API_KEY ? 'meta-llama/llama-3.1-8b-instruct' : 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a Polymarket-style prediction market generator. Your ONLY job is to convert tweet content into BINARY YES/NO prediction questions that are easy to understand.

⚠️  CRITICAL REQUIREMENT: Use simple, everyday language that a high school student or common person would understand. NO technical jargon, no crypto terminology, no complex analysis terms! ⚠️

DO NOT JUST COPY THE TWEET TEXT - YOU MUST TRANSFORM IT INTO A PREDICTION QUESTION!

STEP-BY-STEP PROCESS:
1. Read the tweet content
2. Identify the core claim or topic (price movement, event, announcement, etc.)
3. Convert it into a specific, measurable, future prediction
4. Make it answerable with YES or NO
5. Add specific numbers, prices, or verifiable criteria
6. Set appropriate timeframe
7. Use SIMPLE WORDS - explain like you're talking to your grandparent

GOOD EXAMPLES (Simple & Clear):
❌ BAD: "@user: Solana ecosystem growing"
✅ GOOD: "Will the Solana cryptocurrency price go above $200 by tomorrow?"

❌ BAD: "@user: ETH merge successful"  
✅ GOOD: "Will Ethereum stay above $2,000 for the next 2 days?"

❌ BAD: "@user: New crypto regulation coming"
✅ GOOD: "Will the government announce new rules for cryptocurrency within 7 days?"

❌ BAD: "@user: BTC volatility high"
✅ GOOD: "Will Bitcoin price jump or drop by more than 5% in the next 12 hours?"

LANGUAGE GUIDE - DO THIS:
✅ "Will the price go above $50?" (simple)
✅ "Will Apple announce a new phone by Friday?" (clear, everyday)
✅ "Will more than 1 million people do X?" (understandable)

LANGUAGE GUIDE - AVOID THIS:
❌ "Will the momentum indicator suggest a bullish trend?" (technical)
❌ "Will on-chain metrics indicate accumulation?" (technical)
❌ "Will there be a 20% oscillator deviation?" (jargon)
❌ "Will the protocol governance vote succeed?" (crypto jargon)

TRANSFORMATION PATTERNS (Using Simple Language):
- Price mention → "Will [company/coin name] be worth more than \$[price] by [date]?"
- Event mention → "Will [company/person] announce/release [thing] by [date]?"
- Trend claim → "Will [easy-to-measure outcome] happen by [date]?"
- News → "Will the news about [topic] prove true by [date]?"

MANDATORY RULES:
✅ Start with "Will..."
✅ Include specific numbers, dates, or prices
✅ Be verifiable - use things people can actually check online
✅ Use words a 12-year-old would understand
✅ Set realistic expiry (1-48 hours based on urgency)
✅ Make it YES/NO only

❌ NEVER just copy the tweet text
❌ NEVER use technical terms (momentum, volatility, accumulation, protocol, etc.)
❌ NEVER make vague predictions like "Will sentiment improve?"
❌ NEVER use crypto-specific jargon like "bullish", "altcoin", "whale", "hodl"

CONCRETE EXAMPLES FOR DIFFERENT CATEGORIES:

Technology/Companies:
❌ WRONG: "Will technological innovation metrics exceed threshold?"
✅ RIGHT: "Will Apple release a new iPhone model by end of March?"

Cryptocurrency/Markets:
❌ WRONG: "Will on-chain volume indicate buying pressure?"
✅ RIGHT: "Will Bitcoin price go above \$50,000 by tomorrow?"

Entertainment/Celebrity:
❌ WRONG: "Will sentiment indicate celebrity endorsement trending?"
✅ RIGHT: "Will [celebrity name] announce a new movie by next month?"

Sports:
❌ WRONG: "Will performance metrics suggest team victory probability?"
✅ RIGHT: "Will [team name] win their next game this weekend?"

Return ONLY valid JSON:
{
  "question": "Will [specific, simple prediction] by [date/time]?",
  "data_source": "API or source to verify",
  "expiry": "ISO timestamp",
  "ai_probability": 0.5,
  "confidence": "high/medium/low",
  "reasoning": "Why this probability",
  "suggested_action": "buy/sell/hold"
}`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from AI API');
      }

      const market = JSON.parse(content) as GeneratedMarket;
      try {
        return this.validateMarket(market);
      } catch (validationError) {
        console.error('Market validation error:', validationError instanceof Error ? validationError.message : validationError);
        console.log('Attempting to use validated/corrected market anyway...');
        // Return the market even if validation makes corrections - don't fail
        return market;
      }
    } catch (error) {
      console.error('Error generating market:', error);
      // If it's an auth error, log helpful message
      if (error instanceof Error && error.message.includes('401')) {
        console.error('⚠️  OpenRouter API authentication failed. Please check your OPENROUTER_API_KEY in .env');
      } else if (error instanceof Error && error.message.includes('404')) {
        console.error('⚠️  AI model not found. Please check the model name is correct and available.');
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

    return `
🎯 TWEET TO TRANSFORM INTO A SIMPLE PREDICTION QUESTION:
"${request.trend}"

Category: ${request.category}
Current Time: ${now.toISOString()}

⚠️  YOUR TASK: Turn this tweet into a SIMPLE PREDICTION QUESTION (not a statement!)
Remember: Use words a 12-year-old would understand. NO JARGON!

IMPORTANT REMINDERS:
- This is for REGULAR PEOPLE, not crypto experts
- No crypto terminology (hodl, bullish, bullish, whale, altcoin, protocol, etc.)
- No technical babble (momentum, volatility, oscillator, on-chain metrics, etc.)
- Make it SUPER CLEAR what will happen and when

TRANSFORMATION STEPS:
1. What is the core claim? (e.g., "Solana growing" → predict price movement)
2. What's SIMPLE AND MEASURABLE? (price, event yes/no, count of something)
3. What's the timeframe? (1-6 hours for breaking news, 6-24 for events, 24-48 for trends)
4. Turn into "Will [something simple] happen by [exact time]?" using EVERYDAY WORDS

DURATION GUIDE:
- Breaking news/immediate events → 1-6 hours (${in1Hour.toISOString()} to ${in6Hours.toISOString()})
- Events/announcements → 6-24 hours (${in6Hours.toISOString()} to ${in24Hours.toISOString()})  
- Long-term trends → 24-48 hours (${in24Hours.toISOString()} to ${in48Hours.toISOString()})

⚠️  CRITICAL: Your "question" MUST be a prediction, NOT just the tweet text!

Example Transformations:
Tweet: "@user: Ethereum merge successful"
❌ WRONG: "Ethereum merge successful" 
❌ WRONG: "Will Ethereum on-chain metrics indicate successful execution?"
✅ RIGHT: "Will Ethereum stay above \$2,000 for 48 hours after the merge?"

Tweet: "@user: Apple might release new iPhone soon"
❌ WRONG: "Apple releasing new iPhone"
✅ RIGHT: "Will Apple announce a new iPhone model by end of this month?"

Tweet: "@user: Bitcoin bulls taking over"
❌ WRONG: "Will bullish sentiment continue?"
✅ RIGHT: "Will Bitcoin price reach \$50,000 by tomorrow?"

NOW GENERATE THE MARKET JSON WITH A SIMPLE, CLEAR QUESTION:`;
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
      // Force it to be a question if it's not
      if (!market.question.startsWith('Will')) {
        market.question = `Will ${market.question}`;
      }
      if (!market.question.endsWith('?')) {
        market.question = `${market.question}?`;
      }
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