/**
 * routes/ai.js
 * AI-powered prediction market endpoints
 * Simplified JavaScript version for compatibility
 */

const express = require('express');
const router = express.Router();

// Mock AI analysis for now - can be enhanced later
function mockAnalysis(question) {
  const seed = question ? question.length % 10 : 5;
  const prob = 0.35 + seed * 0.03;
  const sentiment = prob > 0.6 ? 'BULLISH' : prob < 0.45 ? 'BEARISH' : 'NEUTRAL';
  
  return {
    ai_probability: parseFloat(prob.toFixed(2)),
    summary: `Based on current trends, there is a ${(prob * 100).toFixed(0)}% chance this event occurs. Market sentiment is ${sentiment.toLowerCase()}.`,
    sentiment,
  };
}

// Mock trend data
function getMockTrends() {
  return [
    { trend: '#Bitcoin', volume: 125000, category: 'crypto', relevanceScore: 85, isEventBased: true },
    { trend: '#AI', volume: 89000, category: 'technology', relevanceScore: 78, isEventBased: true },
    { trend: '#Tesla', volume: 67000, category: 'finance', relevanceScore: 72, isEventBased: true },
    { trend: '#Algorand', volume: 45000, category: 'crypto', relevanceScore: 65, isEventBased: true },
    { trend: '#NFT', volume: 34000, category: 'crypto', relevanceScore: 58, isEventBased: true }
  ];
}

// GET /ai/scan-trends
router.get('/scan-trends', async (req, res) => {
  try {
    const trends = getMockTrends();
    
    res.json({
      success: true,
      trends,
      count: trends.length,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Trend scanning error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to scan trends',
      message: error.message
    });
  }
});

// POST /ai/generate-market
router.post('/generate-market', async (req, res) => {
  try {
    const { trend, category } = req.body;
    const trendName = trend || '#Bitcoin';
    const trendCategory = category || 'crypto';
    
    // Generate mock market
    const market = {
      question: `Will ${trendName.replace('#', '')} continue trending for the next 24 hours?`,
      data_source: "Twitter API trending data",
      expiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      ai_probability: 0.65,
      confidence: "medium",
      reasoning: `Based on ${trendName} trend momentum and historical patterns.`,
      suggested_action: "BUY YES"
    };

    const advisory = {
      mispricing_percentage: 15,
      advice: "BUY YES",
      explanation: "AI probability higher than expected market price"
    };

    res.json({
      success: true,
      market,
      advisory,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Market generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate market',
      message: error.message
    });
  }
});

// POST /ai/advisory
router.post('/advisory', async (req, res) => {
  try {
    const { ai_probability, market_probability } = req.body;
    
    if (typeof ai_probability !== 'number' || typeof market_probability !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'ai_probability and market_probability must be numbers'
      });
    }

    const difference = Math.abs(ai_probability - market_probability);
    const mispricing_percentage = Math.round(difference * 100);
    
    let advice, explanation;
    if (difference <= 0.10) {
      advice = 'HOLD';
      explanation = `Market is fairly priced. Difference of ${mispricing_percentage}% is below 10% threshold.`;
    } else if (ai_probability > market_probability) {
      advice = 'BUY YES';
      explanation = `AI probability (${(ai_probability * 100).toFixed(1)}%) significantly higher than market price (${(market_probability * 100).toFixed(1)}%).`;
    } else {
      advice = 'BUY NO';
      explanation = `AI probability (${(ai_probability * 100).toFixed(1)}%) significantly lower than market price (${(market_probability * 100).toFixed(1)}%).`;
    }

    const advisory = {
      mispricing_percentage,
      advice,
      explanation
    };

    const detailed_analysis = {
      summary: `${advice}: ${explanation}`,
      risk_assessment: mispricing_percentage >= 20 ? 'Medium risk - significant mispricing' : 'Low risk - minor mispricing',
      confidence_level: mispricing_percentage >= 20 ? 'high' : 'medium',
      suggested_position_size: mispricing_percentage >= 20 ? 'large' : 'medium'
    };

    res.json({
      success: true,
      advisory,
      detailed_analysis,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Advisory analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze advisory',
      message: error.message
    });
  }
});

// GET /ai/ai-analysis/:market_id (legacy compatibility)
router.get('/ai-analysis/:market_id', async (req, res) => {
  try {
    const { market_id } = req.params;
    const analysis = mockAnalysis(`Market ${market_id}`);
    
    res.json({
      market_id,
      ...analysis
    });
  } catch (error) {
    console.error('AI analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI analysis',
      message: error.message
    });
  }
});

module.exports = router;