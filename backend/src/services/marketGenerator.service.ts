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
            content: `You are a prediction market generator. Create binary (YES/NO) markets from trending topics.

STRICT RULES:
- Question must be binary (YES/NO)
- Include measurable condition
- Include exact UTC expiry (24-72 hours from now)
- Include clearly defined data source
- Must be objectively resolvable
- No vague wording

Return ONLY valid JSON in this exact schema:
{
  "question": "",
  "data_source": "",
  "expiry": "",
  "ai_probability": 0.0,
  "confidence": "",
  "reasoning": "",
  "suggested_action": ""
}

No extra text. No markdown. No explanations outside JSON.`
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
Tweet/Trend Content: ${request.trend}
Category: ${request.category}
Engagement: ${request.volume} interactions
Current Time: ${now.toISOString()}

Create a binary prediction market based on this tweet/trend. 

CRITICAL REQUIREMENTS:
1. Question must be directly about the tweet content (e.g., if Elon tweets about Tesla stock, ask "Will Tesla stock reach $X within Y hours?")
2. Choose appropriate duration based on tweet urgency:
   - Breaking news/price predictions: 1-6 hours
   - Announcements/events: 6-24 hours
   - Long-term predictions: 24-48 hours
3. Use measurable criteria (stock prices, official announcements, verified sources)
4. Make expiry time realistic for the prediction type

Example expiry options:
- Very Short (1h):  ${in1Hour.toISOString()}
- Short (6h):      ${in6Hours.toISOString()}
- Medium (12h):    ${in12Hours.toISOString()}
- Standard (24h):  ${in24Hours.toISOString()}
- Extended (48h):  ${in48Hours.toISOString()}

Generate the market now.`;
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

    // Ensure question is binary
    if (!this.isBinaryQuestion(market.question)) {
      market.question = `Will ${market.question}?`;
    }

    return market;
  }

  private isBinaryQuestion(question: string): boolean {
    const binaryIndicators = ['will', 'does', 'is', 'can', 'should', 'has'];
    const lowerQuestion = question.toLowerCase();
    return binaryIndicators.some(indicator => lowerQuestion.startsWith(indicator)) ||
           question.endsWith('?');
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