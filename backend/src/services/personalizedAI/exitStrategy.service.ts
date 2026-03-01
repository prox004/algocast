// ── Exit Strategy Agent ─────────────────────────────────────────────────────

import { 
  ExitStrategyInput, 
  ExitStrategyOutput,
  Trade 
} from './types';

export class ExitStrategyService {
  
  analyze(input: ExitStrategyInput): ExitStrategyOutput {
    try {
      // Validate input
      if (!this.validateInput(input)) {
        return this.getErrorResponse('Invalid input parameters');
      }

      // Calculate key metrics
      const entryProbability = input.trade.entry_probability || 0.5;
      const currentProbability = input.current_probability;
      const aiProbability = input.ai_updated_probability;
      
      // Calculate probability movements
      const marketMove = currentProbability - entryProbability;
      const aiMove = aiProbability - entryProbability;
      const aiMarketDivergence = Math.abs(aiProbability - currentProbability);
      
      // Calculate current P&L estimate
      const currentPnL = this.estimateCurrentPnL(input.trade, currentProbability);
      
      // Time factor analysis
      const timeDecay = this.calculateTimeDecay(input.time_remaining_hours);
      
      // Volatility impact
      const volatilityRisk = this.assessVolatilityRisk(input.volatility_level, input.time_remaining_hours);
      
      // Make decision
      const decision = this.makeExitDecision({
        marketMove,
        aiMove,
        aiMarketDivergence,
        currentPnL,
        timeDecay,
        volatilityRisk,
        timeRemaining: input.time_remaining_hours,
        trade: input.trade
      });

      return decision;

    } catch (error) {
      console.error('[ExitStrategy] Analysis error:', error);
      return this.getErrorResponse('Analysis failed');
    }
  }

  private validateInput(input: ExitStrategyInput): boolean {
    return (
      input.trade && 
      input.trade.side && 
      ['YES', 'NO'].includes(input.trade.side) &&
      typeof input.current_probability === 'number' &&
      input.current_probability >= 0 && input.current_probability <= 1 &&
      typeof input.ai_updated_probability === 'number' &&
      input.ai_updated_probability >= 0 && input.ai_updated_probability <= 1 &&
      typeof input.time_remaining_hours === 'number' &&
      input.time_remaining_hours >= 0 &&
      ['low', 'medium', 'high'].includes(input.volatility_level)
    );
  }

  private estimateCurrentPnL(trade: Trade, currentProbability: number): number {
    // Estimate current value based on probability change
    const entryProbability = trade.entry_probability || 0.5;
    
    if (trade.side === 'YES') {
      // YES position gains value as probability increases
      const probabilityGain = currentProbability - entryProbability;
      return trade.amount * probabilityGain * 2; // Simplified P&L calculation
    } else {
      // NO position gains value as probability decreases  
      const probabilityGain = entryProbability - currentProbability;
      return trade.amount * probabilityGain * 2;
    }
  }

  private calculateTimeDecay(hoursRemaining: number): number {
    // Time decay factor (0 to 1, where 1 is high urgency)
    if (hoursRemaining <= 6) return 1.0;      // Very urgent
    if (hoursRemaining <= 24) return 0.8;     // Urgent
    if (hoursRemaining <= 72) return 0.5;     // Moderate
    if (hoursRemaining <= 168) return 0.2;    // Low urgency
    return 0.1;                               // Very low urgency
  }

  private assessVolatilityRisk(volatility: string, hoursRemaining: number): number {
    const volatilityMultiplier = {
      low: 0.5,
      medium: 1.0,
      high: 1.5
    };
    
    const timeMultiplier = hoursRemaining < 24 ? 1.5 : 1.0;
    
    return volatilityMultiplier[volatility as keyof typeof volatilityMultiplier] * timeMultiplier;
  }

  private makeExitDecision(params: {
    marketMove: number;
    aiMove: number; 
    aiMarketDivergence: number;
    currentPnL: number;
    timeDecay: number;
    volatilityRisk: number;
    timeRemaining: number;
    trade: Trade;
  }): ExitStrategyOutput {
    
    const { 
      marketMove, 
      aiMove, 
      aiMarketDivergence, 
      currentPnL, 
      timeDecay, 
      volatilityRisk,
      timeRemaining,
      trade 
    } = params;

    // Decision factors
    const factors = {
      profitTaking: this.shouldTakeProfit(currentPnL, marketMove, timeDecay),
      stopLoss: this.shouldCutLoss(currentPnL, marketMove, aiMove, volatilityRisk),
      timeUrgency: timeDecay > 0.8,
      aiDivergence: aiMarketDivergence > 0.15,
      strongMove: Math.abs(marketMove) > 0.2
    };

    // Decision logic
    if (factors.stopLoss.should) {
      return {
        action: 'CUT_LOSS',
        confidence: factors.stopLoss.confidence,
        reasoning: factors.stopLoss.reason
      };
    }

    if (factors.profitTaking.should) {
      return {
        action: 'TAKE_PROFIT', 
        confidence: factors.profitTaking.confidence,
        reasoning: factors.profitTaking.reason
      };
    }

    // Default to HOLD with reasoning
    const holdReason = this.generateHoldReasoning(factors, timeRemaining, currentPnL, aiMarketDivergence);
    
    return {
      action: 'HOLD',
      confidence: this.calculateHoldConfidence(factors, timeRemaining),
      reasoning: holdReason
    };
  }

  private shouldTakeProfit(currentPnL: number, marketMove: number, timeDecay: number): {
    should: boolean;
    confidence: 'low' | 'medium' | 'high';
    reason: string;
  } {
    // Strong profit + time pressure
    if (currentPnL > 0 && Math.abs(marketMove) > 0.25 && timeDecay > 0.5) {
      return {
        should: true,
        confidence: 'high',
        reason: `Strong ${(currentPnL > 0 ? '+' : '')}${currentPnL.toFixed(3)} ALGO profit with ${Math.round(Math.abs(marketMove) * 100)}% probability move. Time pressure suggests securing gains.`
      };
    }

    // Very strong profit regardless of time
    if (currentPnL > 0 && Math.abs(marketMove) > 0.3) {
      return {
        should: true,
        confidence: 'high', 
        reason: `Excellent ${currentPnL.toFixed(3)} ALGO profit from ${Math.round(Math.abs(marketMove) * 100)}% favorable probability move. Strong profit-taking opportunity.`
      };
    }

    // Moderate profit with high time decay
    if (currentPnL > 0 && Math.abs(marketMove) > 0.15 && timeDecay > 0.8) {
      return {
        should: true,
        confidence: 'medium',
        reason: `Moderate ${currentPnL.toFixed(3)} ALGO profit with limited time remaining. Securing gains before expiry.`
      };
    }

    return { should: false, confidence: 'low', reason: '' };
  }

  private shouldCutLoss(
    currentPnL: number, 
    marketMove: number, 
    aiMove: number, 
    volatilityRisk: number
  ): {
    should: boolean;
    confidence: 'low' | 'medium' | 'high';
    reason: string;
  } {
    // Severe loss with AI confirmation
    if (currentPnL < -0.5 && marketMove < -0.2 && aiMove < -0.15) {
      return {
        should: true,
        confidence: 'high',
        reason: `Significant ${currentPnL.toFixed(3)} ALGO loss with both market (${Math.round(Math.abs(marketMove) * 100)}%) and AI confirming negative outlook. Cut losses to preserve capital.`
      };
    }

    // Moderate loss with high volatility risk
    if (currentPnL < -0.3 && volatilityRisk > 1.2 && marketMove < -0.15) {
      return {
        should: true,
        confidence: 'medium',
        reason: `${currentPnL.toFixed(3)} ALGO loss in high volatility environment with ${Math.round(Math.abs(marketMove) * 100)}% adverse move. Risk management suggests exit.`
      };
    }

    // AI strongly disagrees with position
    if (Math.abs(aiMove) > 0.25 && Math.sign(aiMove) !== Math.sign(marketMove) && currentPnL < -0.2) {
      return {
        should: true,
        confidence: 'medium',
        reason: `AI analysis strongly contradicts position with ${Math.round(Math.abs(aiMove) * 100)}% probability shift. Current ${currentPnL.toFixed(3)} ALGO loss suggests exit.`
      };
    }

    return { should: false, confidence: 'low', reason: '' };
  }

  private generateHoldReasoning(
    factors: any, 
    timeRemaining: number, 
    currentPnL: number,
    aiDivergence: number
  ): string {
    const reasons: string[] = [];

    // Time factor
    if (timeRemaining > 48) {
      reasons.push('sufficient time for position development');
    } else if (timeRemaining > 12) {
      reasons.push('moderate time remaining for thesis to play out');
    }

    // P&L status
    if (Math.abs(currentPnL) < 0.1) {
      reasons.push('position near breakeven');
    } else if (currentPnL > 0 && currentPnL < 0.3) {
      reasons.push('small profit, room for further gains');
    } else if (currentPnL < 0 && currentPnL > -0.3) {
      reasons.push('manageable loss, potential for recovery');
    }

    // AI divergence
    if (aiDivergence > 0.1) {
      reasons.push('AI-market divergence suggests continued opportunity');
    }

    // Volatility consideration
    if (!factors.timeUrgency && !factors.strongMove) {
      reasons.push('stable conditions favor patience');
    }

    if (reasons.length === 0) {
      reasons.push('current market conditions support holding position');
    }

    return reasons.join(', ') + '.';
  }

  private calculateHoldConfidence(factors: any, timeRemaining: number): 'low' | 'medium' | 'high' {
    let confidenceScore = 0;

    // Time confidence
    if (timeRemaining > 72) confidenceScore += 0.3;
    else if (timeRemaining > 24) confidenceScore += 0.2;
    else if (timeRemaining > 6) confidenceScore += 0.1;

    // Stability confidence  
    if (!factors.strongMove) confidenceScore += 0.2;
    if (!factors.timeUrgency) confidenceScore += 0.2;
    
    // AI alignment confidence
    if (factors.aiDivergence) confidenceScore += 0.2;
    
    // Position health confidence
    if (!factors.stopLoss.should && !factors.profitTaking.should) confidenceScore += 0.1;

    if (confidenceScore >= 0.6) return 'high';
    if (confidenceScore >= 0.3) return 'medium';
    return 'low';
  }

  private getErrorResponse(message: string): ExitStrategyOutput {
    return {
      action: 'HOLD',
      confidence: 'low',
      reasoning: `Error: ${message}. Defaulting to hold position.`
    };
  }
}