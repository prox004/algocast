// ── Trading Coach Agent ─────────────────────────────────────────────────────

import { 
  TradingCoachInput, 
  TradingCoachOutput, 
  Trade, 
  TradingPattern 
} from './types';
import { PersonalizedAIUtils } from './utils';

export class TradingCoachService {
  
  analyze(input: TradingCoachInput): TradingCoachOutput {
    try {
      // Validate and filter trades
      const validTrades = PersonalizedAIUtils.validateTrades(input.trades);
      
      if (validTrades.length === 0) {
        return this.getInsufficientDataResponse();
      }

      // Filter by timeframe if specified
      const trades = input.timeframe_days 
        ? PersonalizedAIUtils.getTradesInTimeframe(validTrades, input.timeframe_days)
        : validTrades;

      if (trades.length < 3) {
        return this.getInsufficientDataResponse();
      }

      // Calculate core metrics
      const winRate = PersonalizedAIUtils.calculateWinRate(trades);
      const avgHoldingTime = PersonalizedAIUtils.calculateAverageHoldingTime(trades);
      const totalPnL = PersonalizedAIUtils.calculateTotalProfitLoss(trades);
      const categoryStats = PersonalizedAIUtils.getCategoryStats(trades);
      
      // Assess risk behavior
      const userBalance = this.estimateUserBalance(trades);
      const riskBehavior = PersonalizedAIUtils.assessRiskBehavior(trades, userBalance);

      // Detect patterns
      const patterns = this.detectTradingPatterns(trades);

      // Generate insights
      const strengths = this.identifyStrengths(trades, categoryStats, winRate, avgHoldingTime);
      const weaknesses = this.identifyWeaknesses(trades, patterns, winRate, riskBehavior);
      const suggestions = this.generateSuggestions(patterns, weaknesses, categoryStats);

      // Calculate confidence
      const confidence = PersonalizedAIUtils.calculateConfidence(trades.length, 15);

      return {
        win_rate: Math.round(winRate * 1000) / 1000, // 3 decimal places
        strengths,
        weaknesses,
        risk_behavior: riskBehavior,
        improvement_suggestions: suggestions,
        confidence
      };

    } catch (error) {
      console.error('[TradingCoach] Analysis error:', error);
      return this.getErrorResponse();
    }
  }

  private detectTradingPatterns(trades: Trade[]): TradingPattern[] {
    const patterns: TradingPattern[] = [];

    // Revenge trading detection
    if (PersonalizedAIUtils.detectRevengeTrading(trades)) {
      patterns.push({
        pattern_type: 'revenge_trading',
        severity: 'high',
        description: 'Detected pattern of increasing bet sizes after losses',
        suggestion: 'Take breaks after losses and stick to predetermined position sizes'
      });
    }

    // Category overexposure
    const overexposure = PersonalizedAIUtils.detectCategoryOverexposure(trades);
    if (overexposure) {
      patterns.push({
        pattern_type: 'overexposure',
        severity: overexposure.exposure > 0.8 ? 'high' : 'medium',
        description: `${Math.round(overexposure.exposure * 100)}% of trades in ${overexposure.category}`,
        suggestion: 'Diversify across multiple market categories to reduce risk'
      });
    }

    // Short-term bias
    if (PersonalizedAIUtils.detectShortTermBias(trades)) {
      patterns.push({
        pattern_type: 'short_term_bias',
        severity: 'medium',
        description: 'Tendency to close positions within 24 hours',
        suggestion: 'Consider longer holding periods for better probability convergence'
      });
    }

    // Category strength detection
    const categoryStats = PersonalizedAIUtils.getCategoryStats(trades);
    const strongCategory = categoryStats.find(stat => 
      stat.win_rate > 0.65 && stat.trade_count >= 5
    );
    
    if (strongCategory) {
      patterns.push({
        pattern_type: 'category_strength',
        severity: 'low',
        description: `Strong performance in ${strongCategory.category} (${Math.round(strongCategory.win_rate * 100)}% win rate)`,
        suggestion: `Consider increasing allocation to ${strongCategory.category} markets`
      });
    }

    return patterns;
  }

  private identifyStrengths(
    trades: Trade[], 
    categoryStats: any[], 
    winRate: number, 
    avgHoldingTime: number
  ): string[] {
    const strengths: string[] = [];

    // High win rate
    if (winRate > 0.6) {
      strengths.push(`Strong win rate of ${Math.round(winRate * 100)}%`);
    }

    // Profitable trading
    const totalPnL = PersonalizedAIUtils.calculateTotalProfitLoss(trades);
    if (totalPnL > 0) {
      strengths.push(`Profitable trading with net gain of ${totalPnL.toFixed(2)} ALGO`);
    }

    // Category expertise
    const expertCategories = categoryStats.filter(stat => 
      stat.win_rate > 0.65 && stat.trade_count >= 3
    );
    if (expertCategories.length > 0) {
      strengths.push(`Expertise in ${expertCategories.map(c => c.category).join(', ')}`);
    }

    // Patience (good holding times)
    if (avgHoldingTime > 48 && avgHoldingTime < 120) {
      strengths.push('Good patience with optimal holding periods');
    }

    // Consistent trading
    if (trades.length >= 20) {
      strengths.push('Consistent trading activity');
    }

    return strengths.length > 0 ? strengths : ['Building trading experience'];
  }

  private identifyWeaknesses(
    trades: Trade[], 
    patterns: TradingPattern[], 
    winRate: number, 
    riskBehavior: string
  ): string[] {
    const weaknesses: string[] = [];

    // Low win rate
    if (winRate < 0.4) {
      weaknesses.push(`Low win rate of ${Math.round(winRate * 100)}%`);
    }

    // Poor risk management
    if (riskBehavior === 'reckless' || riskBehavior === 'aggressive') {
      weaknesses.push(`${riskBehavior.charAt(0).toUpperCase() + riskBehavior.slice(1)} position sizing`);
    }

    // Pattern-based weaknesses
    patterns.forEach(pattern => {
      if (pattern.severity === 'high' || pattern.severity === 'medium') {
        weaknesses.push(pattern.description);
      }
    });

    // Unprofitable trading
    const totalPnL = PersonalizedAIUtils.calculateTotalProfitLoss(trades);
    if (totalPnL < -10) {
      weaknesses.push(`Net losses of ${Math.abs(totalPnL).toFixed(2)} ALGO`);
    }

    return weaknesses;
  }

  private generateSuggestions(
    patterns: TradingPattern[], 
    weaknesses: string[], 
    categoryStats: any[]
  ): string[] {
    const suggestions: string[] = [];

    // Pattern-based suggestions
    patterns.forEach(pattern => {
      suggestions.push(pattern.suggestion);
    });

    // Category diversification
    if (categoryStats.length === 1) {
      suggestions.push('Explore different market categories to build diverse expertise');
    }

    // Position sizing
    if (weaknesses.some(w => w.includes('position sizing'))) {
      suggestions.push('Use 2-5% of bankroll per trade for better risk management');
    }

    // Win rate improvement
    if (weaknesses.some(w => w.includes('win rate'))) {
      suggestions.push('Focus on markets with higher AI confidence scores');
      suggestions.push('Wait for larger probability divergences before entering');
    }

    // General advice if no specific patterns
    if (suggestions.length === 0) {
      suggestions.push('Continue building experience with consistent position sizing');
      suggestions.push('Track performance by category to identify strengths');
    }

    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  private estimateUserBalance(trades: Trade[]): number {
    // Estimate balance from trading volume
    const totalVolume = PersonalizedAIUtils.calculateTotalVolume(trades);
    const avgTradeSize = totalVolume / trades.length;
    
    // Assume average trade is 5% of balance (conservative estimate)
    return avgTradeSize * 20;
  }

  private getInsufficientDataResponse(): TradingCoachOutput {
    return {
      win_rate: 0,
      strengths: ['New trader building experience'],
      weaknesses: ['Insufficient trading history for analysis'],
      risk_behavior: 'conservative',
      improvement_suggestions: [
        'Complete at least 10 trades for meaningful analysis',
        'Start with small position sizes (2-3% of bankroll)',
        'Focus on markets with clear AI probability edges'
      ],
      confidence: 'low'
    };
  }

  private getErrorResponse(): TradingCoachOutput {
    return {
      win_rate: 0,
      strengths: [],
      weaknesses: ['Analysis temporarily unavailable'],
      risk_behavior: 'conservative',
      improvement_suggestions: ['Please try again later'],
      confidence: 'low'
    };
  }
}