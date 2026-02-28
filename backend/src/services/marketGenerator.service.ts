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
            content: `You are a Polymarket-style prediction market generator. Your ONLY job is to convert tweet content into BINARY YES/NO prediction questions.

⚠️  DO NOT JUST COPY THE TWEET TEXT - YOU MUST TRANSFORM IT INTO A PREDICTION QUESTION! ⚠️

STEP-BY-STEP PROCESS:
1. Read the tweet content
2. Identify the core claim or topic (price movement, event, announcement, etc.)
3. Convert it into a specific, measurable, future prediction
4. Make it answerable with YES or NO
5. Add specific numbers, prices, or verifiable criteria
6. Set appropriate timeframe

GOOD EXAMPLES:
❌ BAD: "@user: Solana ecosystem growing"
✅ GOOD: "Will Solana (SOL) price reach $200 within 24 hours?"

❌ BAD: "@user: ETH merge successful"  
✅ GOOD: "Will Ethereum maintain above $2,000 for next 48 hours post-merge?"

❌ BAD: "@user: New crypto regulation coming"
✅ GOOD: "Will SEC announce new crypto regulation within 7 days?"

❌ BAD: "@user: BTC volatility high"
✅ GOOD: "Will Bitcoin (BTC) price move more than 5% in next 12 hours?"

TRANSFORMATION PATTERNS:
- Price mention → "Will [asset] reach/maintain $[price] by [time]?"
- Event mention → "Will [event] happen/be announced by [date]?"
- Trend claim → "Will [metric] increase/decrease by [amount] within [timeframe]?"
- Opinion → "Will [prediction] be confirmed by [verifiable source] by [date]?"

MANDATORY RULES:
✅ Start with "Will..."
✅ Include specific measurable criteria (numbers, dates, prices)
✅ Be verifiable with real data sources
✅ Set realistic expiry (1-48 hours based on urgency)
✅ Make it binary (YES/NO only)

❌ NEVER just copy the tweet text
❌ NEVER make vague predictions
❌ NEVER use opinions as questions

Return ONLY valid JSON:
{
  "question": "Will [specific prediction] by [time]?",
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
      return this.validateMarket(market);
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
🎯 TWEET TO TRANSFORM:
"${request.trend}"

Category: ${request.category}
Current Time: ${now.toISOString()}

⚠️  YOUR TASK: Turn this tweet into a PREDICTION QUESTION (not a statement!)

TRANSFORMATION STEPS:
1. What is the core claim? (e.g., "Solana growing" → predict price movement)
2. What's measurable? (price, event date, announcement, metric)
3. What's the timeframe? (1-48 hours based on urgency)
4. Turn into "Will [something specific] happen by [exact time]?"

DURATION GUIDE:
- Breaking news/prices → 1-6 hours (${in1Hour.toISOString()} to ${in6Hours.toISOString()})
- Events/announcements → 6-24 hours (${in6Hours.toISOString()} to ${in24Hours.toISOString()})  
- Long-term trends → 24-48 hours (${in24Hours.toISOString()} to ${in48Hours.toISOString()})

⚠️  CRITICAL: Your "question" field MUST be a prediction, NOT the tweet text!

Example:
Tweet: "@user: Ethereum merge successful"
❌ WRONG: "Ethereum merge successful"  
✅ RIGHT: "Will Ethereum (ETH) maintain above $2,000 for 48 hours after merge completion?"

NOW GENERATE THE MARKET JSON:`;
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

    // Validate expiry is in future
    const expiryDate = new Date(market.expiry);
    const now = new Date();
    if (expiryDate <= now) {
      const futureExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      market.expiry = futureExpiry.toISOString();
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
    const now = new Date();
    const expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    return {
      question: `Will ${request.trend.replace(/^#/, '')} continue trending for the next 24 hours?`,
      data_source: "Twitter API trending data",
      expiry: expiry.toISOString(),
      ai_probability: 0.5,
      confidence: "medium",
      reasoning: "Fallback market generated due to API limitations. Based on trend persistence patterns.",
      suggested_action: "HOLD"
    };
  }
}