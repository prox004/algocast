// ── Performance Analyzer Agent ─────────────────────────────────────────────

import { 
  PerformanceAnalyzerInput, 
  PerformanceAnalyzerOutput,
  Trade,
  CategoryStats 
} from './types';
import { PersonalizedAIUtils } from './utils';

export class PerformanceAnalyzerService {
  
  analyze(input: PerformanceAnalyzerInput): PerformanceAnalyzerOutput {
    try {
      // Validate and filter trades
      const validTrades = PersonalizedAIUtils.validateTrades(input.weekly_trades);
      
      if (validTrades.length === 0) {
        return this.getNoTradesResponse();
      }

      // Calculate core metrics
      const totalPnL = PersonalizedAIUtils.calculateTotalProfitLoss(validTrades);
      const winRate = PersonalizedAIUtils.calculateWinRate(validTrades);
      const totalVolume = PersonalizedAIUtils.calculateTotalVolume(validTrades);
      const categoryStats = PersonalizedAIUtils.getCategoryStats(validTrades);

      // Find best and worst categories
      const { bestCategory, worstCategory } = this.findBestWorstCategories(categoryStats);

      // Analyze trading patterns
      const mistakes = this.identifyMistakes(validTrades, categoryStats);
      const strengths = this.identifyStrengths(validTrades, categoryStats, winRate, totalPnL);

      // Generate focus areas for next week
      const nextWeekFocus = this.generateNextWeekFocus(mistakes, strengths, categoryStats);

      // Generate weekly summary
      const summary = this.generateWeeklySummary(validTrades, totalPnL, winRate, totalVolume);

      // Calculate confidence
      const confidence = PersonalizedAIUtils.calculateConfidence(validTrades.length, 5);

      return {
        weekly_summary: summary,
        total_profit_loss: Math.round(totalPnL * 1000000) / 1000000, // 6 decimal places
        best_category: bestCategory,
        worst_category: worstCategory,
        key_mistakes: mistakes,
        key_strengths: strengths,
        next_week_focus: nextWeekFocus,
        confidence
      };

    } catch (error) {
      console.error('[PerformanceAnalyzer] Analysis error:', error);
      return this.getErrorResponse();
    }
  }

  private findBestWorstCategories(categoryStats: CategoryStats[]): {
    bestCategory: string;
    worstCategory: string;
  } {
    if (categoryStats.length === 0) {
      return { bestCategory: 'none', worstCategory: 'none' };
    }

    if (categoryStats.length === 1) {
      return { 
        bestCategory: categoryStats[0].category, 
        worstCategory: categoryStats[0].category 
      };
    }

    // Sort by combined score (win rate * volume weight)
    const scoredCategories = categoryStats.map(stat => ({
      ...stat,
      score: stat.win_rate * 0.7 + (stat.avg_profit > 0 ? 0.3 : -0.3)
    })).sort((a, b) => b.score - a.score);

    return {
      bestCategory: scoredCategories[0].category,
      worstCategory: scoredCategories[scoredCategories.length - 1].category
    };
  }

  private identifyMistakes(trades: Trade[], categoryStats: CategoryStats[]): string[] {
    const mistakes: string[] = [];

    // Revenge trading detection
    if (PersonalizedAIUtils.detectRevengeTrading(trades)) {
      mistakes.push('Revenge trading after losses detected');
    }

    // Overexposure to single category
    const overexposure = PersonalizedAIUtils.detectCategoryOverexposure(trades);
    if (overexposure && overexposure.exposure > 0.7) {
      mistakes.push(`Over-concentration in ${overexposure.category} (${Math.round(overexposure.exposure * 100)}%)`);
    }

    // Short-term bias
    if (PersonalizedAIUtils.detectShortTermBias(trades)) {
      mistakes.push('Excessive short-term trading reducing profit potential');
    }

    // Poor timing (weekend trading)
    const weekendTrades = trades.filter(t => PersonalizedAIUtils.isWeekend(t.timestamp));
    if (weekendTrades.length > trades.length * 0.3) {
      mistakes.push('High weekend trading activity when markets may be less efficient');
    }

    // Large losing trades
    const bigLosers = trades.filter(t => t.profit_loss && t.profit_loss < -0.5);
    if (bigLosers.length > 0) {
      mistakes.push(`${bigLosers.length} large losing trades (>0.5 ALGO each)`);
    }

    // Low win rate in high-volume category
    const highVolumeCategory = categoryStats.find(stat => 
      stat.total_volume > 2 && stat.win_rate < 0.4
    );
    if (highVolumeCategory) {
      mistakes.push(`Poor performance in high-activity ${highVolumeCategory.category} category`);
    }

    // Position sizing inconsistency
    const tradeSizes = trades.map(t => t.amount);
    const avgSize = tradeSizes.reduce((a, b) => a + b, 0) / tradeSizes.length;
    const maxSize = Math.max(...tradeSizes);
    if (maxSize > avgSize * 5) {
      mistakes.push('Inconsistent position sizing with some oversized bets');
    }

    return mistakes.slice(0, 4); // Limit to 4 key mistakes
  }

  private identifyStrengths(
    trades: Trade[], 
    categoryStats: CategoryStats[], 
    winRate: number, 
    totalPnL: number
  ): string[] {
    const strengths: string[] = [];

    // High win rate
    if (winRate > 0.6) {
      strengths.push(`Strong ${Math.round(winRate * 100)}% win rate`);
    }

    // Profitability
    if (totalPnL > 0.5) {
      strengths.push(`Solid ${totalPnL.toFixed(2)} ALGO profit generation`);
    } else if (totalPnL > 0) {
      strengths.push(`Positive ${totalPnL.toFixed(3)} ALGO returns`);
    }

    // Category expertise
    const expertCategories = categoryStats.filter(stat => 
      stat.win_rate > 0.65 && stat.trade_count >= 2
    );
    if (expertCategories.length > 0) {
      strengths.push(`Excellence in ${expertCategories.map(c => c.category).join(', ')}`);
    }

    // Consistent activity
    if (trades.length >= 10) {
      strengths.push('High trading activity and market engagement');
    } else if (trades.length >= 5) {
      strengths.push('Consistent trading activity');
    }

    // Risk management
    const avgHoldingTime = PersonalizedAIUtils.calculateAverageHoldingTime(trades);
    if (avgHoldingTime > 24 && avgHoldingTime < 120) {
      strengths.push('Good patience with optimal holding periods');
    }

    // Diversification
    if (categoryStats.length >= 3) {
      strengths.push('Good diversification across market categories');
    }

    // No major losses
    const bigLosses = trades.filter(t => t.profit_loss && t.profit_loss < -1);
    if (bigLosses.length === 0 && trades.length >= 5) {
      strengths.push('Effective loss limitation and risk control');
    }

    // Profitable category focus
    const profitableCategories = categoryStats.filter(stat => stat.avg_profit > 0);
    if (profitableCategories.length === categoryStats.length && categoryStats.length > 1) {
      strengths.push('Profitable across all traded categories');
    }

    return strengths.slice(0, 4); // Limit to 4 key strengths
  }

  private generateNextWeekFocus(
    mistakes: string[], 
    strengths: string[], 
    categoryStats: CategoryStats[]
  ): string[] {
    const focus: string[] = [];

    // Address key mistakes
    if (mistakes.some(m => m.includes('revenge trading'))) {
      focus.push('Implement cooling-off period after losses');
    }

    if (mistakes.some(m => m.includes('concentration') || m.includes('Over-concentration'))) {
      focus.push('Diversify into 2-3 different market categories');
    }

    if (mistakes.some(m => m.includes('short-term'))) {
      focus.push('Target markets with 48+ hour holding periods');
    }

    if (mistakes.some(m => m.includes('position sizing'))) {
      focus.push('Standardize position sizes to 3-5% of bankroll');
    }

    // Leverage strengths
    const strongCategories = categoryStats.filter(stat => stat.win_rate > 0.6);
    if (strongCategories.length > 0 && focus.length < 3) {
      focus.push(`Increase allocation to strong ${strongCategories[0].category} markets`);
    }

    // General improvement areas
    if (focus.length < 3) {
      const weakCategories = categoryStats.filter(stat => stat.win_rate < 0.4 && stat.trade_count >= 2);
      if (weakCategories.length > 0) {
        focus.push(`Analyze and improve ${weakCategories[0].category} market selection`);
      }
    }

    if (focus.length < 3) {
      focus.push('Focus on markets with >10% AI-crowd probability divergence');
    }

    if (focus.length < 3) {
      focus.push('Track and analyze entry timing patterns');
    }

    return focus.slice(0, 3); // Limit to 3 focus areas
  }

  private generateWeeklySummary(
    trades: Trade[], 
    totalPnL: number, 
    winRate: number, 
    totalVolume: number
  ): string {
    const tradeCount = trades.length;
    const avgTradeSize = totalVolume / tradeCount;
    
    let summary = `Completed ${tradeCount} trades with ${Math.round(winRate * 100)}% win rate. `;
    
    if (totalPnL > 0) {
      summary += `Generated ${totalPnL.toFixed(3)} ALGO profit `;
    } else if (totalPnL < 0) {
      summary += `Incurred ${Math.abs(totalPnL).toFixed(3)} ALGO loss `;
    } else {
      summary += `Broke even `;
    }
    
    summary += `across ${totalVolume.toFixed(2)} ALGO total volume. `;
    
    if (avgTradeSize > 1) {
      summary += `Average position size: ${avgTradeSize.toFixed(2)} ALGO.`;
    } else {
      summary += `Average position size: ${avgTradeSize.toFixed(3)} ALGO.`;
    }

    return summary;
  }

  private getNoTradesResponse(): PerformanceAnalyzerOutput {
    return {
      weekly_summary: 'No trading activity this week.',
      total_profit_loss: 0,
      best_category: 'none',
      worst_category: 'none', 
      key_mistakes: [],
      key_strengths: ['Patience and capital preservation'],
      next_week_focus: [
        'Identify high-probability market opportunities',
        'Start with small position sizes (2-3% of bankroll)',
        'Focus on markets with clear AI-crowd divergence'
      ],
      confidence: 'low'
    };
  }

  private getErrorResponse(): PerformanceAnalyzerOutput {
    return {
      weekly_summary: 'Performance analysis temporarily unavailable.',
      total_profit_loss: 0,
      best_category: 'unknown',
      worst_category: 'unknown',
      key_mistakes: ['Analysis error occurred'],
      key_strengths: [],
      next_week_focus: ['Retry analysis when system is available'],
      confidence: 'low'
    };
  }
}