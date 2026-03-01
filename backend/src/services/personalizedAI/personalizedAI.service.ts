// ── Personalized AI Assistant Service ──────────────────────────────────────

import { TradingCoachService } from './tradingCoach.service';
import { MarketRecommenderService } from './marketRecommender.service';
import { PositionSizingService } from './positionSizing.service';
import { ExitStrategyService } from './exitStrategy.service';
import { PerformanceAnalyzerService } from './performanceAnalyzer.service';

import {
  TradingCoachInput,
  TradingCoachOutput,
  MarketRecommenderInput,
  MarketRecommenderOutput,
  PositionSizingInput,
  PositionSizingOutput,
  ExitStrategyInput,
  ExitStrategyOutput,
  PerformanceAnalyzerInput,
  PerformanceAnalyzerOutput,
  Trade,
  Market,
  UserProfile
} from './types';

import { PersonalizedAIUtils } from './utils';

export class PersonalizedAIService {
  private tradingCoach: TradingCoachService;
  private marketRecommender: MarketRecommenderService;
  private positionSizing: PositionSizingService;
  private exitStrategy: ExitStrategyService;
  private performanceAnalyzer: PerformanceAnalyzerService;

  constructor() {
    this.tradingCoach = new TradingCoachService();
    this.marketRecommender = new MarketRecommenderService();
    this.positionSizing = new PositionSizingService();
    this.exitStrategy = new ExitStrategyService();
    this.performanceAnalyzer = new PerformanceAnalyzerService();
  }

  // ── Trading Coach Agent ──────────────────────────────────────────────────────

  analyzeTradingPerformance(input: TradingCoachInput): TradingCoachOutput {
    return this.tradingCoach.analyze(input);
  }

  // ── Market Recommender ───────────────────────────────────────────────────────

  recommendMarkets(input: MarketRecommenderInput): MarketRecommenderOutput {
    return this.marketRecommender.recommend(input);
  }

  // ── Position Sizing Agent ────────────────────────────────────────────────────

  calculatePositionSize(input: PositionSizingInput): PositionSizingOutput {
    return this.positionSizing.calculate(input);
  }

  // ── Exit Strategy Agent ──────────────────────────────────────────────────────

  analyzeExitStrategy(input: ExitStrategyInput): ExitStrategyOutput {
    return this.exitStrategy.analyze(input);
  }

  // ── Performance Analyzer ─────────────────────────────────────────────────────

  analyzeWeeklyPerformance(input: PerformanceAnalyzerInput): PerformanceAnalyzerOutput {
    return this.performanceAnalyzer.analyze(input);
  }

  // ── Utility Methods ──────────────────────────────────────────────────────────

  /**
   * Build user profile from trade history
   */
  buildUserProfile(userId: string, trades: Trade[]): UserProfile {
    const validTrades = PersonalizedAIUtils.validateTrades(trades);
    
    if (validTrades.length === 0) {
      return this.getDefaultUserProfile(userId);
    }

    return {
      user_id: userId,
      total_trades: validTrades.length,
      win_rate: PersonalizedAIUtils.calculateWinRate(validTrades),
      total_volume: PersonalizedAIUtils.calculateTotalVolume(validTrades),
      net_profit_loss: PersonalizedAIUtils.calculateTotalProfitLoss(validTrades),
      avg_holding_time: PersonalizedAIUtils.calculateAverageHoldingTime(validTrades),
      risk_tolerance: this.inferRiskTolerance(validTrades),
      category_preferences: PersonalizedAIUtils.getCategoryPreferences(validTrades),
      category_win_rates: PersonalizedAIUtils.getCategoryWinRates(validTrades)
    };
  }

  /**
   * Get comprehensive analysis for a user
   */
  getComprehensiveAnalysis(userId: string, trades: Trade[], availableMarkets: Market[] = []) {
    const userProfile = this.buildUserProfile(userId, trades);
    
    // Trading coach analysis
    const coachAnalysis = this.analyzeTradingPerformance({
      user_id: userId,
      trades: trades,
      timeframe_days: 30
    });

    // Market recommendations (if markets available)
    let marketRecommendations = null;
    if (availableMarkets.length > 0) {
      marketRecommendations = this.recommendMarkets({
        user_id: userId,
        user_profile: userProfile,
        available_markets: availableMarkets,
        max_recommendations: 5
      });
    }

    // Weekly performance (last 7 days)
    const weeklyTrades = PersonalizedAIUtils.getTradesInTimeframe(trades, 7);
    const weekStart = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const weekEnd = Date.now();
    
    const weeklyPerformance = this.analyzeWeeklyPerformance({
      user_id: userId,
      weekly_trades: weeklyTrades,
      week_start: weekStart,
      week_end: weekEnd
    });

    return {
      user_profile: userProfile,
      trading_coach: coachAnalysis,
      market_recommendations: marketRecommendations,
      weekly_performance: weeklyPerformance,
      timestamp: Date.now()
    };
  }

  // ── Private Helper Methods ───────────────────────────────────────────────────

  private inferRiskTolerance(trades: Trade[]): 'low' | 'medium' | 'high' {
    if (trades.length === 0) return 'medium';
    
    const avgTradeSize = PersonalizedAIUtils.calculateTotalVolume(trades) / trades.length;
    const maxTradeSize = Math.max(...trades.map(t => t.amount));
    
    // Estimate bankroll from trading patterns
    const estimatedBankroll = avgTradeSize * 20; // Assume avg trade is 5% of bankroll
    const maxRiskPercentage = maxTradeSize / estimatedBankroll;
    
    if (maxRiskPercentage > 0.15) return 'high';
    if (maxRiskPercentage > 0.08) return 'medium';
    return 'low';
  }

  private getDefaultUserProfile(userId: string): UserProfile {
    return {
      user_id: userId,
      total_trades: 0,
      win_rate: 0, // Changed from 0.5 to 0 for new users
      total_volume: 0,
      net_profit_loss: 0,
      avg_holding_time: 0, // Changed from 48 to 0 for new users
      risk_tolerance: 'medium',
      category_preferences: {},
      category_win_rates: {}
    };
  }
}

// Singleton instance
let personalizedAIService: PersonalizedAIService | null = null;

export function getPersonalizedAIService(): PersonalizedAIService {
  if (!personalizedAIService) {
    personalizedAIService = new PersonalizedAIService();
  }
  return personalizedAIService;
}

// Export types for external use
export * from './types';