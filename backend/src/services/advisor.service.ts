interface AdvisorRequest {
  ai_probability: number;
  market_probability: number;
  market_id?: string;
  question?: string;
}

interface AdvisorResponse {
  mispricing_percentage: number;
  advice: 'BUY YES' | 'BUY NO' | 'HOLD';
  explanation: string;
}

export class AdvisorService {
  private readonly MISPRICING_THRESHOLD = 0.10; // 10% threshold for trading advice

  analyzeMarket(request: AdvisorRequest): AdvisorResponse {
    const { ai_probability, market_probability } = request;
    
    // Validate inputs
    if (ai_probability < 0 || ai_probability > 1 || market_probability < 0 || market_probability > 1) {
      throw new Error('Probabilities must be between 0 and 1');
    }

    // Calculate mispricing
    const difference = Math.abs(ai_probability - market_probability);
    const mispricing_percentage = Math.round(difference * 100);

    // Determine advice based on mispricing threshold
    if (difference <= this.MISPRICING_THRESHOLD) {
      return {
        mispricing_percentage,
        advice: 'HOLD',
        explanation: `Market is fairly priced. AI estimate: ${(ai_probability * 100).toFixed(1)}%, Market price: ${(market_probability * 100).toFixed(1)}%. Difference of ${mispricing_percentage}% is below ${this.MISPRICING_THRESHOLD * 100}% threshold.`
      };
    }

    // Significant mispricing detected
    let advice: 'BUY YES' | 'BUY NO';
    let explanation: string;

    if (ai_probability > market_probability) {
      // AI thinks YES is more likely than market price suggests
      advice = 'BUY YES';
      explanation = `AI probability (${(ai_probability * 100).toFixed(1)}%) significantly higher than market price (${(market_probability * 100).toFixed(1)}%). Market appears to be undervaluing YES outcome by ${mispricing_percentage}%.`;
    } else {
      // AI thinks NO is more likely than market price suggests
      advice = 'BUY NO';
      explanation = `AI probability (${(ai_probability * 100).toFixed(1)}%) significantly lower than market price (${(market_probability * 100).toFixed(1)}%). Market appears to be overvaluing YES outcome by ${mispricing_percentage}%.`;
    }

    return {
      mispricing_percentage,
      advice,
      explanation
    };
  }

  calculateExpectedValue(
    ai_probability: number,
    market_probability: number,
    bet_amount: number
  ): { expected_value: number; roi_percentage: number } {
    // Simple expected value calculation
    // Assumes 1:1 payout ratio for simplicity
    const yes_payout = bet_amount / market_probability;
    const no_payout = bet_amount / (1 - market_probability);

    let expected_value: number;
    
    if (ai_probability > market_probability) {
      // Betting YES
      expected_value = (ai_probability * yes_payout) + ((1 - ai_probability) * (-bet_amount));
    } else {
      // Betting NO
      expected_value = ((1 - ai_probability) * no_payout) + (ai_probability * (-bet_amount));
    }

    const roi_percentage = ((expected_value / bet_amount) * 100);

    return {
      expected_value: Math.round(expected_value * 100) / 100, // Round to 2 decimal places
      roi_percentage: Math.round(roi_percentage * 100) / 100
    };
  }

  getConfidenceLevel(mispricing_percentage: number): 'low' | 'medium' | 'high' {
    if (mispricing_percentage >= 25) return 'high';
    if (mispricing_percentage >= 15) return 'medium';
    return 'low';
  }

  generateDetailedAnalysis(request: AdvisorRequest): {
    summary: string;
    risk_assessment: string;
    confidence_level: 'low' | 'medium' | 'high';
    suggested_position_size: 'small' | 'medium' | 'large';
  } {
    const analysis = this.analyzeMarket(request);
    const confidence_level = this.getConfidenceLevel(analysis.mispricing_percentage);
    
    let risk_assessment: string;
    let suggested_position_size: 'small' | 'medium' | 'large';

    if (analysis.advice === 'HOLD') {
      risk_assessment = 'Low risk - market appears fairly priced';
      suggested_position_size = 'small';
    } else {
      if (analysis.mispricing_percentage >= 25) {
        risk_assessment = 'Medium risk - significant mispricing detected, but market could be pricing in unknown factors';
        suggested_position_size = 'large';
      } else if (analysis.mispricing_percentage >= 15) {
        risk_assessment = 'Medium risk - moderate mispricing, proceed with caution';
        suggested_position_size = 'medium';
      } else {
        risk_assessment = 'Higher risk - small mispricing, could be noise';
        suggested_position_size = 'small';
      }
    }

    const summary = `${analysis.advice}: ${analysis.explanation}`;

    return {
      summary,
      risk_assessment,
      confidence_level,
      suggested_position_size
    };
  }
}