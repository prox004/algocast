import OpenAI from 'openai';
import axios from 'axios';

interface SentimentResult {
  success: boolean;
  market_id: string;
  sentiment: {
    score: number; // -1 to 1 (negative to positive)
    label: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number; // 0 to 1
    momentum: 'RISING' | 'FALLING' | 'STABLE';
  };
  analysis: {
    ai_probability: number;
    crowd_probability: number;
    divergence: number; // Percentage difference
    recommendation: 'BUY YES' | 'BUY NO' | 'HOLD';
  };
  sources: {
    news_count: number;
    social_mentions: number;
    trend_volume: number;
  };
  summary: string;
  timestamp: number;
}

export class SentimentService {
  private openai?: OpenAI;
  private newsApiKey?: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ 
        apiKey,
        baseURL: process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : undefined
      });
    }
    this.newsApiKey = process.env.NEWS_API_KEY;
  }

  async analyze(marketId: string, question: string, crowdProbability: number): Promise<SentimentResult> {
    try {
      // Get AI sentiment analysis
      const aiAnalysis = await this.getAISentiment(question);
      
      // Get news sentiment (if API available)
      const newsSentiment = await this.getNewsSentiment(question);
      
      // Calculate combined sentiment
      const combinedScore = this.calculateCombinedSentiment(aiAnalysis.score, newsSentiment.score);
      
      // Determine sentiment label
      const label = this.getSentimentLabel(combinedScore);
      
      // Calculate momentum
      const momentum = this.calculateMomentum(combinedScore, aiAnalysis.confidence);
      
      // Calculate AI probability from sentiment
      const aiProbability = this.sentimentToProbability(combinedScore);
      
      // Calculate divergence
      const divergence = Math.abs(aiProbability - crowdProbability) * 100;
      
      // Generate recommendation
      const recommendation = this.generateRecommendation(aiProbability, crowdProbability, divergence);
      
      // Generate summary
      const summary = this.generateSummary(label, aiProbability, crowdProbability, divergence, momentum);

      return {
        success: true,
        market_id: marketId,
        sentiment: {
          score: combinedScore,
          label,
          confidence: (aiAnalysis.confidence + newsSentiment.confidence) / 2,
          momentum
        },
        analysis: {
          ai_probability: aiProbability,
          crowd_probability: crowdProbability,
          divergence: Math.round(divergence),
          recommendation
        },
        sources: {
          news_count: newsSentiment.articleCount,
          social_mentions: newsSentiment.mentions,
          trend_volume: aiAnalysis.trendVolume
        },
        summary,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[SentimentService] Analysis error:', error);
      // Return fallback sentiment
      return this.getFallbackSentiment(marketId, question, crowdProbability);
    }
  }

  private async getAISentiment(question: string): Promise<{ score: number; confidence: number; trendVolume: number }> {
    if (!this.openai) {
      return { score: 0, confidence: 0.5, trendVolume: 50000 };
    }

    try {
      const prompt = `Analyze the sentiment for this prediction market question: "${question}"

Return a JSON object with:
- score: number from -1 (very bearish) to 1 (very bullish)
- confidence: number from 0 to 1
- reasoning: brief explanation

Consider:
- Market trends and momentum
- Historical patterns
- Current events relevance
- Risk factors

Respond with only valid JSON.`;

      const response = await this.openai.chat.completions.create({
        model: process.env.OPENROUTER_API_KEY ? 'meta-llama/llama-3.1-8b-instruct:free' : 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 200
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) throw new Error('Empty AI response');

      const parsed = JSON.parse(content);
      return {
        score: Math.max(-1, Math.min(1, parsed.score || 0)),
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        trendVolume: 75000
      };
    } catch (error) {
      console.error('[SentimentService] AI sentiment error:', error);
      return { score: 0, confidence: 0.5, trendVolume: 50000 };
    }
  }

  private async getNewsSentiment(question: string): Promise<{ score: number; confidence: number; articleCount: number; mentions: number }> {
    // Extract keywords from question
    const keywords = this.extractKeywords(question);
    
    if (!this.newsApiKey || keywords.length === 0) {
      return { score: 0, confidence: 0.3, articleCount: 0, mentions: 0 };
    }

    try {
      // Search news for keywords
      const response = await axios.get('https://newsapi.org/v2/everything', {
        params: {
          q: keywords.join(' OR '),
          language: 'en',
          sortBy: 'publishedAt',
          pageSize: 20,
          apiKey: this.newsApiKey
        },
        timeout: 5000
      });

      const articles = response.data.articles || [];
      
      if (articles.length === 0) {
        return { score: 0, confidence: 0.3, articleCount: 0, mentions: 0 };
      }

      // Analyze sentiment from headlines and descriptions
      let positiveCount = 0;
      let negativeCount = 0;
      let totalMentions = 0;

      const positiveWords = ['surge', 'rise', 'gain', 'up', 'increase', 'bullish', 'positive', 'growth', 'boom', 'rally'];
      const negativeWords = ['fall', 'drop', 'decline', 'down', 'decrease', 'bearish', 'negative', 'crash', 'plunge', 'slump'];

      articles.forEach((article: any) => {
        const text = `${article.title} ${article.description}`.toLowerCase();
        totalMentions++;

        const hasPositive = positiveWords.some(word => text.includes(word));
        const hasNegative = negativeWords.some(word => text.includes(word));

        if (hasPositive && !hasNegative) positiveCount++;
        else if (hasNegative && !hasPositive) negativeCount++;
      });

      const score = totalMentions > 0 
        ? (positiveCount - negativeCount) / totalMentions 
        : 0;

      return {
        score: Math.max(-1, Math.min(1, score)),
        confidence: Math.min(0.8, totalMentions / 20),
        articleCount: articles.length,
        mentions: totalMentions
      };
    } catch (error) {
      console.error('[SentimentService] News sentiment error:', error);
      return { score: 0, confidence: 0.3, articleCount: 0, mentions: 0 };
    }
  }

  private extractKeywords(question: string): string[] {
    // Remove common words and extract meaningful keywords
    const stopWords = ['will', 'the', 'be', 'in', 'on', 'at', 'to', 'a', 'an', 'by', 'for', 'of', 'is', 'are'];
    const words = question.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.includes(word));
    
    return words.slice(0, 5); // Top 5 keywords
  }

  private calculateCombinedSentiment(aiScore: number, newsScore: number): number {
    // Weight AI more heavily (70%) than news (30%)
    return (aiScore * 0.7) + (newsScore * 0.3);
  }

  private getSentimentLabel(score: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    if (score > 0.2) return 'BULLISH';
    if (score < -0.2) return 'BEARISH';
    return 'NEUTRAL';
  }

  private calculateMomentum(score: number, confidence: number): 'RISING' | 'FALLING' | 'STABLE' {
    const strength = Math.abs(score) * confidence;
    
    if (strength > 0.5) {
      return score > 0 ? 'RISING' : 'FALLING';
    }
    return 'STABLE';
  }

  private sentimentToProbability(score: number): number {
    // Convert sentiment score (-1 to 1) to probability (0 to 1)
    // Score of 0 = 50% probability
    // Score of 1 = 75% probability
    // Score of -1 = 25% probability
    return 0.5 + (score * 0.25);
  }

  private generateRecommendation(aiProb: number, crowdProb: number, divergence: number): 'BUY YES' | 'BUY NO' | 'HOLD' {
    if (divergence < 10) return 'HOLD';
    
    if (aiProb > crowdProb) return 'BUY YES';
    return 'BUY NO';
  }

  private generateSummary(
    label: string, 
    aiProb: number, 
    crowdProb: number, 
    divergence: number,
    momentum: string
  ): string {
    const aiPercent = (aiProb * 100).toFixed(1);
    const crowdPercent = (crowdProb * 100).toFixed(1);
    
    let summary = `${label} sentiment detected. `;
    summary += `AI analysis: ${aiPercent}%, Market: ${crowdPercent}%. `;
    
    if (divergence > 10) {
      summary += `Significant ${divergence.toFixed(0)}% divergence detected. `;
    }
    
    summary += `Momentum: ${momentum}.`;
    
    return summary;
  }

  private getFallbackSentiment(marketId: string, question: string, crowdProbability: number): SentimentResult {
    // Simple fallback based on question keywords
    const text = question.toLowerCase();
    const bullishWords = ['increase', 'rise', 'gain', 'up', 'exceed', 'above', 'higher'];
    const bearishWords = ['decrease', 'fall', 'drop', 'down', 'below', 'lower'];
    
    let score = 0;
    bullishWords.forEach(word => { if (text.includes(word)) score += 0.2; });
    bearishWords.forEach(word => { if (text.includes(word)) score -= 0.2; });
    
    score = Math.max(-1, Math.min(1, score));
    const label = this.getSentimentLabel(score);
    const aiProbability = this.sentimentToProbability(score);
    const divergence = Math.abs(aiProbability - crowdProbability) * 100;

    return {
      success: true,
      market_id: marketId,
      sentiment: {
        score,
        label,
        confidence: 0.5,
        momentum: 'STABLE'
      },
      analysis: {
        ai_probability: aiProbability,
        crowd_probability: crowdProbability,
        divergence: Math.round(divergence),
        recommendation: this.generateRecommendation(aiProbability, crowdProbability, divergence)
      },
      sources: {
        news_count: 0,
        social_mentions: 0,
        trend_volume: 50000
      },
      summary: `${label} sentiment (fallback analysis). AI: ${(aiProbability * 100).toFixed(1)}%, Market: ${(crowdProbability * 100).toFixed(1)}%.`,
      timestamp: Date.now()
    };
  }
}

// Singleton instance
let sentimentService: SentimentService | null = null;

export function getSentimentService(): SentimentService {
  if (!sentimentService) {
    sentimentService = new SentimentService();
  }
  return sentimentService;
}
