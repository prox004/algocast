// ── Shared Utilities for Personalized AI Assistant ─────────────────────────

import { Trade, Market, UserProfile, CategoryStats } from './types';

export class PersonalizedAIUtils {
  
  // ── Trade Analysis ──────────────────────────────────────────────────────────
  
  static calculateWinRate(trades: Trade[]): number {
    if (trades.length === 0) return 0;
    const winners = trades.filter(t => t.is_winner === true).length;
    return winners / trades.length;
  }

  static calculateAverageHoldingTime(trades: Trade[]): number {
    if (trades.length === 0) return 0;
    const validTrades = trades.filter(t => t.holding_time && t.holding_time > 0);
    if (validTrades.length === 0) return 0;
    
    const totalTime = validTrades.reduce((sum, t) => sum + (t.holding_time || 0), 0);
    return totalTime / validTrades.length;
  }

  static calculateTotalProfitLoss(trades: Trade[]): number {
    return trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
  }

  static calculateTotalVolume(trades: Trade[]): number {
    return trades.reduce((sum, t) => sum + t.amount, 0);
  }

  // ── Category Analysis ───────────────────────────────────────────────────────

  static getCategoryStats(trades: Trade[]): CategoryStats[] {
    const categoryMap = new Map<string, Trade[]>();
    
    trades.forEach(trade => {
      const category = trade.category || 'general';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(trade);
    });

    return Array.from(categoryMap.entries()).map(([category, categoryTrades]) => ({
      category,
      trade_count: categoryTrades.length,
      win_rate: this.calculateWinRate(categoryTrades),
      avg_profit: this.calculateTotalProfitLoss(categoryTrades) / categoryTrades.length,
      total_volume: this.calculateTotalVolume(categoryTrades)
    }));
  }

  static getCategoryPreferences(trades: Trade[]): Record<string, number> {
    const categoryStats = this.getCategoryStats(trades);
    const totalTrades = trades.length;
    
    const preferences: Record<string, number> = {};
    categoryStats.forEach(stat => {
      preferences[stat.category] = stat.trade_count / totalTrades;
    });
    
    return preferences;
  }

  static getCategoryWinRates(trades: Trade[]): Record<string, number> {
    const categoryStats = this.getCategoryStats(trades);
    
    const winRates: Record<string, number> = {};
    categoryStats.forEach(stat => {
      winRates[stat.category] = stat.win_rate;
    });
    
    return winRates;
  }

  // ── Pattern Detection ───────────────────────────────────────────────────────

  static detectRevengeTrading(trades: Trade[]): boolean {
    if (trades.length < 3) return false;
    
    // Sort by timestamp
    const sortedTrades = [...trades].sort((a, b) => a.timestamp - b.timestamp);
    
    let revengeSequences = 0;
    for (let i = 1; i < sortedTrades.length - 1; i++) {
      const prev = sortedTrades[i - 1];
      const curr = sortedTrades[i];
      const next = sortedTrades[i + 1];
      
      // Check if previous trade was a loss followed by quick successive trades
      if (prev.is_winner === false && 
          curr.timestamp - prev.timestamp < 3600000 && // Within 1 hour
          next.timestamp - curr.timestamp < 3600000 &&
          curr.amount > prev.amount * 1.5) { // Increased bet size
        revengeSequences++;
      }
    }
    
    return revengeSequences >= 2;
  }

  static detectCategoryOverexposure(trades: Trade[]): { category: string; exposure: number } | null {
    const categoryStats = this.getCategoryStats(trades);
    const maxExposure = categoryStats.reduce((max, stat) => 
      stat.trade_count > max.trade_count ? stat : max, categoryStats[0]);
    
    const exposurePercentage = maxExposure.trade_count / trades.length;
    
    return exposurePercentage > 0.6 ? { 
      category: maxExposure.category, 
      exposure: exposurePercentage 
    } : null;
  }

  static detectShortTermBias(trades: Trade[]): boolean {
    if (trades.length === 0) return false;
    
    const avgHoldingTime = this.calculateAverageHoldingTime(trades);
    const shortTermTrades = trades.filter(t => (t.holding_time || 0) < 24).length;
    
    return avgHoldingTime < 12 && (shortTermTrades / trades.length) > 0.7;
  }

  // ── Risk Assessment ─────────────────────────────────────────────────────────

  static assessRiskBehavior(trades: Trade[], userBalance: number): 'conservative' | 'moderate' | 'aggressive' | 'reckless' {
    if (trades.length === 0) return 'conservative';
    
    const avgBetSize = this.calculateTotalVolume(trades) / trades.length;
    const maxBetSize = Math.max(...trades.map(t => t.amount));
    const avgBetPercentage = avgBetSize / userBalance;
    const maxBetPercentage = maxBetSize / userBalance;
    
    if (maxBetPercentage > 0.25 || avgBetPercentage > 0.1) return 'reckless';
    if (maxBetPercentage > 0.15 || avgBetPercentage > 0.05) return 'aggressive';
    if (maxBetPercentage > 0.05 || avgBetPercentage > 0.02) return 'moderate';
    return 'conservative';
  }

  // ── Market Scoring ──────────────────────────────────────────────────────────

  static scoreMarketForUser(market: Market, userProfile: UserProfile): number {
    let score = 0;
    
    // Category preference (40% weight)
    const categoryPreference = userProfile.category_preferences[market.category] || 0;
    score += categoryPreference * 0.4;
    
    // Category performance (30% weight)
    const categoryWinRate = userProfile.category_win_rates[market.category] || 0.5;
    score += categoryWinRate * 0.3;
    
    // Edge strength (20% weight)
    const edge = Math.abs(market.ai_probability - market.market_probability);
    score += Math.min(edge * 2, 0.2); // Cap at 0.2
    
    // Time to expiry (10% weight)
    const hoursToExpiry = (market.expiry - Date.now()) / (1000 * 60 * 60);
    const timeScore = Math.min(hoursToExpiry / 168, 1) * 0.1; // Prefer markets with reasonable time
    score += timeScore;
    
    return Math.min(score, 1);
  }

  // ── Kelly Criterion (Simplified) ────────────────────────────────────────────

  static calculateKellyBetSize(
    bankroll: number, 
    winProbability: number, 
    odds: number,
    maxBetPercentage: number = 0.1
  ): number {
    // Kelly formula: f = (bp - q) / b
    // where b = odds, p = win probability, q = lose probability
    const b = odds;
    const p = winProbability;
    const q = 1 - p;
    
    const kellyFraction = (b * p - q) / b;
    
    // Cap at maxBetPercentage for safety
    const safeFraction = Math.min(Math.max(kellyFraction, 0), maxBetPercentage);
    
    return bankroll * safeFraction;
  }

  // ── Time Utilities ──────────────────────────────────────────────────────────

  static getTradesInTimeframe(trades: Trade[], days: number): Trade[] {
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    return trades.filter(t => t.timestamp >= cutoffTime);
  }

  static isWeekend(timestamp: number): boolean {
    const date = new Date(timestamp);
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday or Saturday
  }

  // ── Confidence Calculation ──────────────────────────────────────────────────

  static calculateConfidence(dataPoints: number, minRequired: number = 10): 'low' | 'medium' | 'high' {
    if (dataPoints < minRequired * 0.3) return 'low';
    if (dataPoints < minRequired) return 'medium';
    return 'high';
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  static validateTrades(trades: Trade[]): Trade[] {
    return trades.filter(trade => 
      trade.id && 
      trade.user_id && 
      trade.market_id && 
      ['YES', 'NO'].includes(trade.side) &&
      typeof trade.amount === 'number' && trade.amount > 0 &&
      typeof trade.tokens === 'number' && trade.tokens > 0 &&
      typeof trade.timestamp === 'number' && trade.timestamp > 0
    );
  }

  static validateMarkets(markets: Market[]): Market[] {
    return markets.filter(market =>
      market.id &&
      market.question &&
      typeof market.ai_probability === 'number' &&
      typeof market.market_probability === 'number' &&
      market.ai_probability >= 0 && market.ai_probability <= 1 &&
      market.market_probability >= 0 && market.market_probability <= 1 &&
      typeof market.expiry === 'number' && market.expiry > Date.now()
    );
  }
}