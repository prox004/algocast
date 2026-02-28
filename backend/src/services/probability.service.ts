import OpenAI from 'openai';

interface ProbabilityRequest {
  question: string;
  data_source: string;
  trend_data: {
    volume: number;
    category: string;
    timestamp: number;
  };
  market_context?: {
    similar_markets?: any[];
    historical_outcomes?: any[];
  };
}

interface ProbabilityEstimate {
  probability: number;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  factors: {
    trend_strength: number;
    historical_pattern: number;
    market_sentiment: number;
    time_sensitivity: number;
  };
}

export class ProbabilityService {
  private openai?: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      console.warn('OPENAI_API_KEY not set, using fallback probability estimation');
    }
  }

  async estimateProbability(request: ProbabilityRequest): Promise<ProbabilityEstimate> {
    try {
      const factors = this.calculateFactors(request);
      const aiProbability = await this.getAIProbability(request);
      
      // Combine AI estimate with factor-based calculation
      const combinedProbability = this.combineEstimates(aiProbability, factors);
      
      return {
        probability: combinedProbability,
        confidence: this.calculateConfidence(factors),
        reasoning: await this.generateReasoning(request, factors, combinedProbability),
        factors
      };
    } catch (error) {
      console.error('Error estimating probability:', error);
      return this.getFallbackEstimate(request);
    }
  }

  private calculateFactors(request: ProbabilityRequest) {
    const { trend_data } = request;
    
    // Trend strength (0-1) based on volume
    const trend_strength = Math.min(trend_data.volume / 100000, 1);
    
    // Historical pattern (mock for now - would use real data)
    const historical_pattern = this.getHistoricalPattern(trend_data.category);
    
    // Market sentiment (based on category and volume growth)
    const market_sentiment = this.calculateMarketSentiment(trend_data);
    
    // Time sensitivity (how quickly trends in this category change)
    const time_sensitivity = this.getTimeSensitivity(trend_data.category);
    
    return {
      trend_strength,
      historical_pattern,
      market_sentiment,
      time_sensitivity
    };
  }

  private getHistoricalPattern(category: string): number {
    // Mock historical success rates by category
    const patterns = {
      crypto: 0.65,      // Crypto trends are moderately predictable
      finance: 0.70,     // Financial events have good historical data
      politics: 0.55,    // Political events are less predictable
      technology: 0.75,  // Tech announcements are often predictable
      sports: 0.80,      // Sports outcomes have good historical data
      general: 0.50      // General trends are unpredictable
    };
    
    return patterns[category as keyof typeof patterns] || patterns.general;
  }

  private calculateMarketSentiment(trend_data: any): number {
    // Simple sentiment calculation based on volume and recency
    const volumeScore = Math.min(trend_data.volume / 50000, 1);
    const recencyScore = this.getRecencyScore(trend_data.timestamp);
    
    return (volumeScore + recencyScore) / 2;
  }

  private getRecencyScore(timestamp: number): number {
    const hoursOld = (Date.now() - timestamp) / (1000 * 60 * 60);
    if (hoursOld < 1) return 1.0;
    if (hoursOld < 6) return 0.8;
    if (hoursOld < 24) return 0.6;
    return 0.4;
  }

  private getTimeSensitivity(category: string): number {
    // How quickly do trends in this category change?
    const sensitivity = {
      crypto: 0.9,       // Very time-sensitive
      finance: 0.8,      // Quite time-sensitive
      politics: 0.6,     // Moderately time-sensitive
      technology: 0.7,   // Moderately time-sensitive
      sports: 0.5,       // Less time-sensitive (scheduled events)
      general: 0.7       // Default
    };
    
    return sensitivity[category as keyof typeof sensitivity] || sensitivity.general;
  }

  private async getAIProbability(request: ProbabilityRequest): Promise<number> {
    if (!this.openai) {
      return 0.5; // Default neutral probability
    }

    const prompt = `
Analyze this prediction market and estimate the probability of YES outcome:

Question: ${request.question}
Data Source: ${request.data_source}
Trend Volume: ${request.trend_data.volume}
Category: ${request.trend_data.category}

Consider:
- Historical patterns for similar events
- Current market conditions
- Trend momentum and sustainability
- External factors that could influence outcome

Respond with only a number between 0 and 1 (e.g., 0.65 for 65% probability).
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a probability estimation expert. Analyze the given information and provide a single probability number between 0 and 1.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 50
      });

      const content = response.choices[0]?.message?.content?.trim();
      const probability = parseFloat(content || '0.5');
      
      return Math.max(0, Math.min(1, probability));
    } catch (error) {
      console.error('Error getting AI probability:', error);
      return 0.5; // Default neutral probability
    }
  }

  private combineEstimates(aiProbability: number, factors: any): number {
    // Weighted combination of AI estimate and factor-based calculation
    const factorProbability = (
      factors.trend_strength * 0.3 +
      factors.historical_pattern * 0.3 +
      factors.market_sentiment * 0.2 +
      factors.time_sensitivity * 0.2
    );
    
    // Weight AI estimate more heavily if confidence factors are strong
    const aiWeight = (factors.trend_strength + factors.historical_pattern) / 2;
    const factorWeight = 1 - aiWeight;
    
    const combined = aiProbability * aiWeight + factorProbability * factorWeight;
    return Math.max(0.05, Math.min(0.95, combined)); // Keep within reasonable bounds
  }

  private calculateConfidence(factors: any): 'low' | 'medium' | 'high' {
    const avgFactor = (
      factors.trend_strength +
      factors.historical_pattern +
      factors.market_sentiment +
      factors.time_sensitivity
    ) / 4;
    
    if (avgFactor > 0.7) return 'high';
    if (avgFactor > 0.5) return 'medium';
    return 'low';
  }

  private async generateReasoning(
    request: ProbabilityRequest,
    factors: any,
    probability: number
  ): Promise<string> {
    const strengthDesc = factors.trend_strength > 0.7 ? 'strong' : 
                        factors.trend_strength > 0.4 ? 'moderate' : 'weak';
    
    const sentimentDesc = factors.market_sentiment > 0.6 ? 'positive' : 
                         factors.market_sentiment > 0.4 ? 'neutral' : 'negative';
    
    return `Probability estimate of ${(probability * 100).toFixed(1)}% based on ${strengthDesc} trend momentum (${request.trend_data.volume} mentions), ${sentimentDesc} market sentiment, and ${(factors.historical_pattern * 100).toFixed(0)}% historical success rate for ${request.trend_data.category} category events.`;
  }

  private getFallbackEstimate(request: ProbabilityRequest): ProbabilityEstimate {
    return {
      probability: 0.5,
      confidence: 'low',
      reasoning: 'Fallback estimate due to API limitations. Based on neutral probability for trending topics.',
      factors: {
        trend_strength: 0.5,
        historical_pattern: 0.5,
        market_sentiment: 0.5,
        time_sensitivity: 0.5
      }
    };
  }
}