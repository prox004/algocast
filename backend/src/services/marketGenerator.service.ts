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
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      console.warn('OPENAI_API_KEY not set, using fallback market generation');
    }
  }

  async generateMarket(request: MarketRequest): Promise<GeneratedMarket> {
    if (!this.openai) {
      return this.generateFallbackMarket(request);
    }

    const prompt = this.buildMarketPrompt(request);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
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
        throw new Error('No response from OpenAI');
      }

      const market = JSON.parse(content) as GeneratedMarket;
      return this.validateMarket(market);
    } catch (error) {
      console.error('Error generating market:', error);
      return this.generateFallbackMarket(request);
    }
  }

  private buildMarketPrompt(request: MarketRequest): string {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dayAfter = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    return `
Trending Topic: ${request.trend}
Category: ${request.category}
Volume: ${request.volume} mentions
Current Time: ${now.toISOString()}

Create a binary prediction market for this trend. Consider:
- Market should resolve within 24-48 hours
- Use reliable data sources (official websites, exchanges, news APIs)
- Make it objectively measurable
- Estimate probability based on historical patterns and current context

Example expiry times:
- Tomorrow: ${tomorrow.toISOString()}
- Day after: ${dayAfter.toISOString()}

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