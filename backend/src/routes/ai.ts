import express from 'express';
import { MarketAgent } from '../agents/marketAgent';
import { AdvisorService } from '../services/advisor.service';
import { getSentimentService } from '../services/sentiment.service';

const router = express.Router();

// Lazy-load services to ensure env vars are loaded
let marketAgent: MarketAgent | null = null;
let advisorService: AdvisorService | null = null;

const getMarketAgent = () => {
  if (!marketAgent) {
    marketAgent = new MarketAgent();
  }
  return marketAgent;
};

const getAdvisorService = () => {
  if (!advisorService) {
    advisorService = new AdvisorService();
  }
  return advisorService;
};

// Simple auth middleware type
const auth = (req: any, res: any, next: any) => {
  // For now, just pass through - integrate with existing auth later
  next();
};

// ── Sentiment endpoint ───────────────────────────────────────────────────────

const db = require('../db');

// GET /analysis/:market_id - Get AI analysis for specific market
router.get('/analysis/:market_id', async (req, res) => {
  try {
    const marketId = req.params.market_id;
    const market = db.getMarketById(marketId);
    
    if (!market) {
      return res.status(404).json({
        success: false,
        error: `Market ${marketId} not found`,
      });
    }

    // Return AI analysis based on market data
    const analysis = {
      market_id: marketId,
      ai_probability: market.ai_probability || 0.5,
      sentiment: market.ai_probability > 0.65 ? 'BULLISH' : market.ai_probability < 0.35 ? 'BEARISH' : 'NEUTRAL',
      summary: market.reasoning || `Based on market data, the AI estimates a ${(market.ai_probability * 100).toFixed(1)}% probability of YES outcome. This assessment incorporates current market sentiment and available trend data.`,
    };
    
    res.json(analysis);
  } catch (error) {
    console.error('AI analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI analysis',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /sentiment/:market_id — Real-time news sentiment for a market
router.get('/sentiment/:market_id', async (req, res) => {
  try {
    const { market_id } = req.params;

    // Look up the market from DB to get question + probability
    const market = db.getMarketById(market_id);
    if (!market) {
      return res.status(404).json({
        success: false,
        error: `Market ${market_id} not found`,
      });
    }

    const sentimentService = getSentimentService();
    const result = await sentimentService.analyze(
      market_id,
      market.question,
      market.market_probability ?? 0.5,
    );

    // Return the sentiment result directly - it already has the right structure
    return res.json(result);
  } catch (error) {
    console.error('[Sentiment] Endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to analyze sentiment',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /scan-trends - Scan and return filtered trends
router.get('/scan-trends', auth, async (req, res) => {
  try {
    const trends = await getMarketAgent().scanTrendsOnly();
    
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
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /scan-user/:username - Get latest tweets from specific user
router.get('/scan-user/:username', auth, async (req, res) => {
  try {
    const { username } = req.params;
    const agent = getMarketAgent();
    
    // Access the Twitter service through the agent
    const tweets = await (agent as any).twitterService.getUserLatestTweets(username, 10);
    
    res.json({
      success: true,
      username,
      tweets: tweets.map((tweet: any) => ({
        id: tweet.id,
        text: tweet.text,
        created_at: tweet.created_at,
        metrics: tweet.public_metrics
      })),
      count: tweets.length,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('User tweet scanning error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to scan user tweets',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /generate-market - Generate market from trend or auto-generate
router.post('/generate-market', auth, async (req, res) => {
  try {
    const { trend, category } = req.body;
    
    let result;
    if (trend) {
      // Generate market from specific trend
      result = await getMarketAgent().generateMarketFromTrend(trend, category);
    } else {
      // Auto-generate from current trends
      const pipelineResult = await getMarketAgent().processMarketGeneration();
      
      if (pipelineResult.error) {
        throw new Error(pipelineResult.error);
      }
      
      result = {
        market: pipelineResult.generated_market,
        probability: pipelineResult.probability_estimate,
        advisory: pipelineResult.advisor_analysis
      };
    }

    // Format response according to context.md schema
    const market = {
      question: result.market.question,
      data_source: result.market.data_source,
      expiry: result.market.expiry,
      ai_probability: result.probability.probability,
      confidence: result.probability.confidence,
      reasoning: result.probability.reasoning,
      suggested_action: result.advisory.advice
    };

    res.json({
      success: true,
      market,
      advisory: result.advisory,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Market generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate market',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /advisory - Get trading advisory for market
router.post('/advisory', auth, async (req, res) => {
  try {
    const { ai_probability, market_probability, market_id, question } = req.body;
    
    // Validate inputs
    if (typeof ai_probability !== 'number' || typeof market_probability !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'ai_probability and market_probability must be numbers'
      });
    }

    if (ai_probability < 0 || ai_probability > 1 || market_probability < 0 || market_probability > 1) {
      return res.status(400).json({
        success: false,
        error: 'Probabilities must be between 0 and 1'
      });
    }

    const advisory = getAdvisorService().analyzeMarket({
      ai_probability,
      market_probability,
      market_id,
      question
    });

    const detailedAnalysis = getAdvisorService().generateDetailedAnalysis({
      ai_probability,
      market_probability,
      market_id,
      question
    });

    return res.json({
      success: true,
      advisory,
      detailed_analysis: detailedAnalysis,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Advisory analysis error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to analyze advisory',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /ai-analysis/:market_id - Get AI analysis for specific market (from context.md)
router.get('/ai-analysis/:market_id', async (req, res) => {
  try {
    const { market_id } = req.params;
    
    // Mock AI analysis - in real implementation, would fetch market data and analyze
    const mockAnalysis = {
      market_id,
      ai_probability: 0.65,
      summary: "Based on current trend analysis and historical patterns, this market shows moderate bullish sentiment with 65% probability of YES outcome.",
      sentiment: "BULLISH" as const
    };

    res.json(mockAnalysis);
  } catch (error) {
    console.error('AI analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI analysis',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /validate-market - Validate market structure
router.post('/validate-market', auth, async (req, res) => {
  try {
    const { question, data_source, expiry, ai_probability } = req.body;
    
    // Convert Unix timestamp (seconds) to milliseconds if needed
    let expiryDate: Date;
    if (typeof expiry === 'number') {
      // If it's a number, it could be Unix seconds or milliseconds
      // Unix timestamps are typically between 1.6B - 1.7B (seconds), milliseconds would be 1e12+
      const ms = expiry > 1e11 ? expiry : expiry * 1000;
      expiryDate = new Date(ms);
    } else {
      expiryDate = new Date(expiry);
    }
    
    const validations = [
      { 
        field: 'question', 
        value: question, 
        check: question && typeof question === 'string' && question.length > 10,
        message: 'Question must be a string with more than 10 characters'
      },
      { 
        field: 'data_source', 
        value: data_source, 
        check: data_source && typeof data_source === 'string' && data_source.length > 5,
        message: 'Data source must be a string with more than 5 characters'
      },
      { 
        field: 'expiry', 
        value: expiry, 
        check: !isNaN(expiryDate.getTime()) && expiryDate > new Date(),
        message: 'Expiry must be a valid future date'
      },
      { 
        field: 'ai_probability', 
        value: ai_probability, 
        check: typeof ai_probability === 'number' && ai_probability >= 0 && ai_probability <= 1,
        message: 'AI probability must be a number between 0 and 1'
      }
    ];

    const errors = validations.filter(v => !v.check);
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        valid: false,
        errors: errors.map(e => ({ field: e.field, message: e.message }))
      });
    }

    return res.json({
      success: true,
      valid: true,
      message: 'Market structure is valid'
    });
  } catch (error) {
    console.error('Market validation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to validate market',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;