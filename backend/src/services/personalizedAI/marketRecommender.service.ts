// ── Market Recommender Agent ───────────────────────────────────────────────

import { 
  MarketRecommenderInput, 
  MarketRecommenderOutput, 
  MarketRecommendation,
  Market,
  UserProfile 
} from './types';
import { PersonalizedAIUtils } from './utils';

export class MarketRecommenderService {
  
  recommend(input: MarketRecommenderInput): MarketRecommenderOutput {
    try {
      // Validate inputs
      const validMarkets = PersonalizedAIUtils.validateMarkets(input.available_markets);
      
      if (validMarkets.length === 0) {
        return this.getNoMarketsResponse();
      }

      // Filter out resolved markets
      const activeMarkets = validMarkets.filter(m => !m.resolved);
      
      if (activeMarkets.length === 0) {
        return this.getNoActiveMarketsResponse();
      }

      // Score each market for the user
      const scoredMarkets = activeMarkets.map(market => ({
        market,
        score: PersonalizedAIUtils.scoreMarketForUser(market, input.user_profile),
        reasons: this.generateReasons(market, input.user_profile)
      }));

      // Sort by score (highest first)
      scoredMarkets.sort((a, b) => b.score - a.score);

      // Take top recommendations
      const maxRecommendations = input.max_recommendations || 5;
      const topMarkets = scoredMarkets.slice(0, maxRecommendations);

      // Filter out very low scores (< 0.3)
      const qualityMarkets = topMarkets.filter(m => m.score >= 0.3);

      if (qualityMarkets.length === 0) {
        return this.getLowQualityMarketsResponse();
      }

      // Generate recommendations
      const recommendations: MarketRecommendation[] = qualityMarkets.map(item => ({
        market_id: item.market.id,
        reason: item.reasons.join('. '),
        match_score: Math.round(item.score * 1000) / 1000 // 3 decimal places
      }));

      // Calculate confidence based on user profile completeness
      const confidence = this.calculateRecommendationConfidence(input.user_profile, qualityMarkets.length);

      return {
        recommended_markets: recommendations,
        confidence
      };

    } catch (error) {
      console.error('[MarketRecommender] Recommendation error:', error);
      return this.getErrorResponse();
    }
  }

  private generateReasons(market: Market, userProfile: UserProfile): string[] {
    const reasons: string[] = [];

    // Category preference
    const categoryPreference = userProfile.category_preferences[market.category] || 0;
    if (categoryPreference > 0.2) {
      reasons.push(`Strong interest in ${market.category} markets (${Math.round(categoryPreference * 100)}% of your trades)`);
    }

    // Category performance
    const categoryWinRate = userProfile.category_win_rates[market.category] || 0.5;
    if (categoryWinRate > 0.6) {
      reasons.push(`Excellent track record in ${market.category} (${Math.round(categoryWinRate * 100)}% win rate)`);
    }

    // Edge opportunity
    const edge = Math.abs(market.ai_probability - market.market_probability);
    if (edge > 0.15) {
      const direction = market.ai_probability > market.market_probability ? 'undervalued' : 'overvalued';
      reasons.push(`Significant mispricing detected - market appears ${direction} by ${Math.round(edge * 100)}%`);
    } else if (edge > 0.08) {
      reasons.push(`Moderate edge opportunity with ${Math.round(edge * 100)}% probability divergence`);
    }

    // Time factor
    const hoursToExpiry = (market.expiry - Date.now()) / (1000 * 60 * 60);
    if (hoursToExpiry > 24 && hoursToExpiry < 168) {
      reasons.push('Optimal time window for position development');
    }

    // Risk alignment
    if (userProfile.risk_tolerance === 'high' && edge > 0.1) {
      reasons.push('High-conviction opportunity matching your risk appetite');
    } else if (userProfile.risk_tolerance === 'low' && edge > 0.05 && edge < 0.12) {
      reasons.push('Conservative opportunity with moderate edge');
    }

    // Volatility consideration
    if (typeof market.volatility === 'number') {
      if (market.volatility < 0.3 && userProfile.risk_tolerance === 'low') {
        reasons.push('Low volatility market suitable for conservative approach');
      } else if (market.volatility > 0.7 && userProfile.risk_tolerance === 'high') {
        reasons.push('High volatility market with potential for significant moves');
      }
    }

    // Default reason if no specific matches
    if (reasons.length === 0) {
      reasons.push('Market fundamentals align with your trading profile');
    }

    return reasons.slice(0, 3); // Limit to 3 reasons per market
  }

  private calculateRecommendationConfidence(
    userProfile: UserProfile, 
    recommendationCount: number
  ): 'low' | 'medium' | 'high' {
    let confidenceScore = 0;

    // User experience factor
    if (userProfile.total_trades >= 20) confidenceScore += 0.4;
    else if (userProfile.total_trades >= 10) confidenceScore += 0.2;

    // Category diversity factor
    const categoryCount = Object.keys(userProfile.category_preferences).length;
    if (categoryCount >= 3) confidenceScore += 0.3;
    else if (categoryCount >= 2) confidenceScore += 0.2;

    // Performance factor
    if (userProfile.win_rate > 0.55) confidenceScore += 0.3;
    else if (userProfile.win_rate > 0.45) confidenceScore += 0.2;

    // Recommendation quality factor
    if (recommendationCount >= 3) confidenceScore += 0.1;

    if (confidenceScore >= 0.7) return 'high';
    if (confidenceScore >= 0.4) return 'medium';
    return 'low';
  }

  private getNoMarketsResponse(): MarketRecommenderOutput {
    return {
      recommended_markets: [],
      confidence: 'low'
    };
  }

  private getNoActiveMarketsResponse(): MarketRecommenderOutput {
    return {
      recommended_markets: [],
      confidence: 'low'
    };
  }

  private getLowQualityMarketsResponse(): MarketRecommenderOutput {
    return {
      recommended_markets: [],
      confidence: 'low'
    };
  }

  private getErrorResponse(): MarketRecommenderOutput {
    return {
      recommended_markets: [],
      confidence: 'low'
    };
  }
}