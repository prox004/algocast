// ── Position Sizing Agent ───────────────────────────────────────────────────

import { 
  PositionSizingInput, 
  PositionSizingOutput 
} from './types';
import { PersonalizedAIUtils } from './utils';

export class PositionSizingService {
  
  // Risk limits by tolerance level
  private readonly RISK_LIMITS = {
    low: { max_percentage: 0.03, max_single_bet: 0.05 },      // 3% avg, 5% max
    medium: { max_percentage: 0.05, max_single_bet: 0.08 },   // 5% avg, 8% max  
    high: { max_percentage: 0.08, max_single_bet: 0.12 }      // 8% avg, 12% max
  };

  calculate(input: PositionSizingInput): PositionSizingOutput {
    try {
      // Validate inputs
      if (!this.validateInput(input)) {
        return this.getErrorResponse('Invalid input parameters');
      }

      // Calculate edge
      const edge = input.ai_probability - input.market_probability;
      const edgeStrength = Math.abs(edge);

      // Get risk parameters
      const riskParams = this.RISK_LIMITS[input.risk_tolerance];
      
      // Calculate base bet size using multiple methods
      const kellySize = this.calculateKellySize(input, edgeStrength);
      const fixedSize = this.calculateFixedPercentageSize(input, riskParams);
      const edgeBasedSize = this.calculateEdgeBasedSize(input, edgeStrength, riskParams);
      
      // Choose the most conservative size
      const recommendedSize = Math.min(kellySize, fixedSize, edgeBasedSize);
      
      // Apply category performance adjustment
      const adjustedSize = this.applyCategoryAdjustment(recommendedSize, input);
      
      // Final safety checks
      const finalSize = this.applySafetyLimits(adjustedSize, input, riskParams);
      
      // Calculate percentage of bankroll
      const percentage = finalSize / input.user_bankroll;
      
      // Determine risk level
      const riskLevel = this.determineRiskLevel(percentage, input.risk_tolerance);
      
      // Generate reasoning
      const reasoning = this.generateReasoning(input, finalSize, percentage, edge);

      return {
        recommended_bet_size: Math.round(finalSize * 1000000) / 1000000, // 6 decimal places for ALGO
        percentage_of_bankroll: Math.round(percentage * 1000) / 1000,    // 3 decimal places
        risk_level: riskLevel,
        reasoning
      };

    } catch (error) {
      console.error('[PositionSizing] Calculation error:', error);
      return this.getErrorResponse('Calculation failed');
    }
  }

  private validateInput(input: PositionSizingInput): boolean {
    return (
      typeof input.user_bankroll === 'number' && input.user_bankroll > 0 &&
      ['low', 'medium', 'high'].includes(input.risk_tolerance) &&
      typeof input.ai_probability === 'number' && 
      input.ai_probability >= 0 && input.ai_probability <= 1 &&
      typeof input.market_probability === 'number' && 
      input.market_probability >= 0 && input.market_probability <= 1
    );
  }

  private calculateKellySize(input: PositionSizingInput, edgeStrength: number): number {
    // Simplified Kelly Criterion
    // Only use Kelly if we have a significant edge (> 5%)
    if (edgeStrength < 0.05) {
      return input.user_bankroll * 0.02; // Conservative 2% if no clear edge
    }

    // Calculate implied odds from market probability
    const marketOdds = input.market_probability > 0.5 
      ? (1 - input.market_probability) / input.market_probability  // Betting on NO
      : input.market_probability / (1 - input.market_probability); // Betting on YES

    const winProbability = input.ai_probability > 0.5 ? input.ai_probability : 1 - input.ai_probability;
    
    // Kelly with 25% reduction for safety
    const kellyFraction = PersonalizedAIUtils.calculateKellyBetSize(
      input.user_bankroll, 
      winProbability, 
      marketOdds,
      this.RISK_LIMITS[input.risk_tolerance].max_single_bet
    );

    return kellyFraction * 0.75; // 25% Kelly reduction for safety
  }

  private calculateFixedPercentageSize(input: PositionSizingInput, riskParams: any): number {
    return input.user_bankroll * riskParams.max_percentage;
  }

  private calculateEdgeBasedSize(
    input: PositionSizingInput, 
    edgeStrength: number, 
    riskParams: any
  ): number {
    // Scale bet size based on edge strength
    let sizeMultiplier = 1;
    
    if (edgeStrength >= 0.20) sizeMultiplier = 1.5;      // Very strong edge
    else if (edgeStrength >= 0.15) sizeMultiplier = 1.3; // Strong edge  
    else if (edgeStrength >= 0.10) sizeMultiplier = 1.1; // Good edge
    else if (edgeStrength >= 0.05) sizeMultiplier = 0.8; // Weak edge
    else sizeMultiplier = 0.5;                           // No clear edge

    const baseSize = input.user_bankroll * riskParams.max_percentage;
    return baseSize * sizeMultiplier;
  }

  private applyCategoryAdjustment(baseSize: number, input: PositionSizingInput): number {
    // Adjust based on user's historical performance in this category
    if (!input.market_category || input.user_category_performance === undefined) {
      return baseSize;
    }

    const performance = input.user_category_performance;
    
    if (performance > 0.65) return baseSize * 1.2;      // Strong category performance
    else if (performance > 0.55) return baseSize * 1.1; // Good category performance  
    else if (performance < 0.35) return baseSize * 0.7; // Poor category performance
    else if (performance < 0.45) return baseSize * 0.8; // Below average performance
    
    return baseSize; // Average performance
  }

  private applySafetyLimits(
    size: number, 
    input: PositionSizingInput, 
    riskParams: any
  ): number {
    // Never exceed maximum single bet limit
    const maxBet = input.user_bankroll * riskParams.max_single_bet;
    
    // Never bet more than 50% of available balance (assuming some is already deployed)
    const maxAvailable = input.user_bankroll * 0.5;
    
    // Minimum bet (0.1% of bankroll or 0.001 ALGO, whichever is higher)
    const minBet = Math.max(input.user_bankroll * 0.001, 0.001);
    
    return Math.max(minBet, Math.min(size, maxBet, maxAvailable));
  }

  private determineRiskLevel(percentage: number, tolerance: string): 'low' | 'medium' | 'high' {
    const limits = this.RISK_LIMITS[tolerance as keyof typeof this.RISK_LIMITS];
    
    if (percentage >= limits.max_single_bet * 0.8) return 'high';
    if (percentage >= limits.max_percentage * 1.2) return 'medium';
    return 'low';
  }

  private generateReasoning(
    input: PositionSizingInput, 
    finalSize: number, 
    percentage: number, 
    edge: number
  ): string {
    const parts: string[] = [];
    
    // Edge analysis
    const edgeStrength = Math.abs(edge);
    if (edgeStrength >= 0.15) {
      parts.push(`Strong ${Math.round(edgeStrength * 100)}% edge detected`);
    } else if (edgeStrength >= 0.08) {
      parts.push(`Moderate ${Math.round(edgeStrength * 100)}% edge identified`);
    } else if (edgeStrength >= 0.03) {
      parts.push(`Small ${Math.round(edgeStrength * 100)}% edge present`);
    } else {
      parts.push('No significant edge detected');
    }

    // Risk tolerance
    parts.push(`${input.risk_tolerance} risk tolerance applied`);
    
    // Position size context
    const percentageDisplay = Math.round(percentage * 100 * 10) / 10; // 1 decimal place
    parts.push(`${percentageDisplay}% of bankroll allocation`);
    
    // Category performance
    if (input.user_category_performance !== undefined) {
      const perfPercent = Math.round(input.user_category_performance * 100);
      if (perfPercent > 60) {
        parts.push(`increased for strong ${input.market_category} performance (${perfPercent}%)`);
      } else if (perfPercent < 45) {
        parts.push(`reduced due to weak ${input.market_category} performance (${perfPercent}%)`);
      }
    }

    // Safety note
    if (percentage < 0.02) {
      parts.push('conservative sizing for capital preservation');
    } else if (percentage > 0.08) {
      parts.push('aggressive sizing due to strong conviction');
    }

    return parts.join(', ') + '.';
  }

  private getErrorResponse(message: string): PositionSizingOutput {
    return {
      recommended_bet_size: 0,
      percentage_of_bankroll: 0,
      risk_level: 'low',
      reasoning: `Error: ${message}`
    };
  }
}