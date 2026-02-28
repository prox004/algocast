import { TwitterService } from '../services/twitter.service';
import { TrendFilterService } from '../services/trendFilter.service';
import { MarketGeneratorService } from '../services/marketGenerator.service';
import { ProbabilityService } from '../services/probability.service';
import { AdvisorService } from '../services/advisor.service';
import { tickerExtractionService } from '../services/tickerExtraction.service';
import { getDatabase, StoredMarket } from '../services/database.service';
import { v4 as uuidv4 } from 'uuid';

// Legacy db.js for the frontend-facing market list
const legacyDb = require('../db');

interface AgentState {
  step: string;
  trends: any[];
  filtered_trends: any[];
  generated_market: any;
  probability_estimate: any;
  advisor_analysis: any;
  error?: string;
}

export class MarketAgent {
  private twitterService: TwitterService;
  private trendFilterService: TrendFilterService;
  private marketGeneratorService: MarketGeneratorService;
  private probabilityService: ProbabilityService;
  private advisorService: AdvisorService;

  /**
   * Set of tweet IDs that have already been processed into markets.
   * Prevents the same tweet from generating duplicate markets across cycles.
   */
  private processedTweetIds: Set<string> = new Set();

  constructor(twitterService?: TwitterService) {
    // Accept an existing TwitterService to preserve cursor state across cycles,
    // or create a new one if none is provided.
    this.twitterService = twitterService || new TwitterService();
    this.trendFilterService = new TrendFilterService();
    this.marketGeneratorService = new MarketGeneratorService();
    this.probabilityService = new ProbabilityService();
    this.advisorService = new AdvisorService();

    // Pre-populate processedTweetIds from the database so we never
    // re-process tweets that already have markets from previous runs.
    this.loadProcessedTweetsFromDb();
  }

  /**
   * Load tweet IDs that already have markets in the database so that
   * a server restart doesn't cause old tweets to be reprocessed.
   */
  private loadProcessedTweetsFromDb(): void {
    try {
      const db = getDatabase();
      const existingMarkets = db.getMarkets(undefined, 500);
      for (const m of existingMarkets) {
        if (m.tweet_id) {
          this.processedTweetIds.add(m.tweet_id);
        }
      }
      console.log(`[MarketAgent] Loaded ${this.processedTweetIds.size} already-processed tweet IDs from DB`);
    } catch (err) {
      console.warn('[MarketAgent] Could not pre-load processed tweet IDs:', err);
    }
  }

  async processMarketGeneration(input?: string): Promise<AgentState> {
    const state: AgentState = {
      step: 'start',
      trends: [],
      filtered_trends: [],
      generated_market: null,
      probability_estimate: null,
      advisor_analysis: null
    };

    try {
      // Step 1: Scan trends
      state.step = 'scanning_trends';
      state.trends = await this.twitterService.getTrends();
      
      // Step 2: Filter trends
      state.step = 'filtering_trends';
      state.filtered_trends = this.trendFilterService.filterTrends(state.trends);
      
      if (state.filtered_trends.length === 0) {
        throw new Error('No marketable trends found');
      }

      // Step 2.5: Remove tweets that have already been processed into markets
      //           Match on the tweet_id that was attached in getTrends()
      const unprocessedTrends = state.filtered_trends.filter((t: any) => {
        // Find the original trend data to get the tweet_id
        const original = state.trends.find(
          (orig: any) => orig.trend === t.trend || orig.tweet_id === t.tweet_id
        );
        const tweetId = (t as any).tweet_id || original?.tweet_id;
        if (tweetId && this.processedTweetIds.has(tweetId)) {
          console.log(`[MarketAgent] ⏭️  Skipping already-processed tweet ${tweetId}`);
          return false;
        }
        return true;
      });

      if (unprocessedTrends.length === 0) {
        throw new Error('All fetched tweets have already been processed into markets');
      }

      state.filtered_trends = unprocessedTrends;

      // Step 3: Generate market
      state.step = 'generating_market';
      const topTrend = state.filtered_trends[0];
      state.generated_market = await this.marketGeneratorService.generateMarket({
        trend: topTrend.trend,
        category: topTrend.category,
        volume: topTrend.volume
      });

      // Step 4: Estimate probability
      state.step = 'estimating_probability';
      state.probability_estimate = await this.probabilityService.estimateProbability({
        question: state.generated_market.question,
        data_source: state.generated_market.data_source,
        trend_data: {
          volume: topTrend.volume,
          category: topTrend.category,
          timestamp: Date.now()
        }
      });

      console.log('[MarketAgent] Probability estimate:', state.probability_estimate);

      // Step 5: Validate market
      state.step = 'validating_market';
      try {
        this.validateMarket(state.generated_market, state.probability_estimate);
        console.log('[MarketAgent] ✅ Market validation passed');
      } catch (validationError) {
        console.error('[MarketAgent] ❌ Validation failed:', validationError instanceof Error ? validationError.message : validationError);
        throw validationError;
      }

      // Step 6: Save to database
      state.step = 'saving_to_database';
      this.saveMarketToDatabase(state.generated_market, state.probability_estimate, topTrend);

      // Step 7: Generate advisory
      state.step = 'analyzing_advisory';
      state.advisor_analysis = this.advisorService.analyzeMarket({
        ai_probability: state.probability_estimate.probability,
        market_probability: 0.5, // Mock market probability
        question: state.generated_market.question
      });

      state.step = 'completed';
      return state;
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Unknown error';
      state.step = 'failed';
      return state;
    }
  }

  async scanTrendsOnly(): Promise<any[]> {
    try {
      const trends = await this.twitterService.getTrends();
      const filtered = this.trendFilterService.filterTrends(trends);
      return filtered;
    } catch (error) {
      console.error('Trend scanning failed:', error);
      return [];
    }
  }

  async generateMarketFromTrend(trend: string, category: string = 'general'): Promise<any> {
    try {
      const market = await this.marketGeneratorService.generateMarket({
        trend,
        category,
        volume: 50000 // Default volume
      });

      const probability = await this.probabilityService.estimateProbability({
        question: market.question,
        data_source: market.data_source,
        trend_data: {
          volume: 50000,
          category,
          timestamp: Date.now()
        }
      });

      const advisory = this.advisorService.analyzeMarket({
        ai_probability: probability.probability,
        market_probability: 0.5, // Mock market probability
        question: market.question
      });

      return {
        market,
        probability,
        advisory
      };
    } catch (error) {
      console.error('Market generation from trend failed:', error);
      throw error;
    }
  }

  private validateMarket(market: any, probability: any): void {
    // Convert Unix timestamp (seconds) to milliseconds if needed
    let expiryDate: Date;
    if (typeof market.expiry === 'number') {
      // If it's a number, it could be Unix seconds or milliseconds
      // Unix timestamps are typically between 1.6B - 1.7B (seconds), milliseconds would be 1e12+
      const ms = market.expiry > 1e11 ? market.expiry : market.expiry * 1000;
      expiryDate = new Date(ms);
    } else {
      // Assume it's an ISO string or other Date-parseable format
      expiryDate = new Date(market.expiry);
    }

    const now = new Date();
    const minBufferMs = 5000; // 5 second minimum buffer
    const expiryWithBuffer = new Date(expiryDate.getTime() + minBufferMs);

    // Log expiry validation details for debugging
    console.log(`[MarketAgent] Validating expiry:`, {
      expiry: market.expiry,
      expiryDate: expiryDate.toISOString(),
      now: now.toISOString(),
      isValid: !isNaN(expiryDate.getTime()),
      isFuture: expiryDate > now,
      isFutureWithBuffer: expiryWithBuffer > now,
    });

    const validations = [
      { check: market.question && market.question.length > 10, message: 'Question too short' },
      { check: market.data_source && market.data_source.length > 5, message: 'Data source missing' },
      { check: !isNaN(expiryDate.getTime()), message: 'Expiry is invalid date' },
      { check: expiryWithBuffer > now, message: 'Expiry in past or too soon' },
      { check: probability && typeof probability.probability === 'number' && probability.probability >= 0 && probability.probability <= 1, message: 'Invalid probability' }
    ];

    const failedValidations = validations.filter(v => !v.check);
    
    if (failedValidations.length > 0) {
      throw new Error(`Validation failed: ${failedValidations.map(v => v.message).join(', ')}`);
    }
  }

  private saveMarketToDatabase(market: any, probability: any, trend: any): void {
    try {
      const db = getDatabase();
      
      // Check if market already exists for this tweet
      if (trend.tweet_id && db.marketExistsForTweet(trend.tweet_id)) {
        console.log(`[MarketAgent] Market already exists for tweet ${trend.tweet_id}, skipping save`);
        return;
      }

      // Extract ticker information from the market question
      const tickerInfo = tickerExtractionService.extractTicker(market.question);

      const storedMarket: StoredMarket = {
        id: uuidv4(),
        question: market.question,
        data_source: market.data_source,
        expiry: market.expiry,
        ai_probability: probability.probability,
        confidence: market.confidence || probability.confidence,
        reasoning: market.reasoning || probability.reasoning,
        suggested_action: market.suggested_action || 'HOLD',
        status: 'active',
        created_at: new Date().toISOString(),
        tweet_id: trend.tweet_id,
        tweet_author: trend.tweet_author,
        tweet_content: trend.tweet_content || trend.trend,
        category: trend.category,
        volume: trend.volume,
        ticker: tickerInfo?.ticker || null,
        asset_type: tickerInfo?.assetType || null,
      };

      // Save to legacy db.js FIRST — this is what the frontend reads
      try {
        const expiryTs = Math.floor(new Date(market.expiry).getTime() / 1000);
        legacyDb.createMarket({
          id: storedMarket.id,
          question: storedMarket.question,
          expiry: expiryTs,
          data_source: storedMarket.data_source,
          ai_probability: storedMarket.ai_probability,
          market_probability: 0.5,
          yes_reserve: 0,
          no_reserve: 0,
          yes_asa_id: null,
          no_asa_id: null,
          app_id: null,
          app_address: null,
          outcome: null,
          status: 'active',
          tweet_id: storedMarket.tweet_id || null,
          tweet_author: storedMarket.tweet_author || null,
          tweet_content: storedMarket.tweet_content || null,
          ticker: storedMarket.ticker || null,
          asset_type: storedMarket.asset_type || null,
        });
        console.log(`[MarketAgent] ✅ Saved to legacy DB for frontend`);
      } catch (legacyErr: any) {
        // Don't fail if legacy save has issues (e.g. duplicate ID)
        if (!legacyErr.message?.includes('UNIQUE constraint')) {
          console.warn(`[MarketAgent] ⚠️ Legacy DB save failed:`, legacyErr.message);
        }
      }

      // Also save to DatabaseService (for TS routes / internal queries)
      try {
        db.saveMarket(storedMarket);
        console.log(`[MarketAgent] ✅ Also saved to DatabaseService`);
      } catch (dbErr: any) {
        if (!dbErr.message?.includes('UNIQUE constraint')) {
          console.warn(`[MarketAgent] ⚠️ DatabaseService save failed:`, dbErr.message);
        }
      }
      
      // Log ticker extraction if found
      if (tickerInfo) {
        console.log(`[MarketAgent] ✓ Extracted ticker: ${tickerInfo.ticker} (${tickerInfo.assetType || 'unknown'}) - Confidence: ${tickerInfo.confidence}`);
        if (tickerInfo.notes) {
          console.log(`   ${tickerInfo.notes}`);
        }
      }

      // Track this tweet as processed so it won't generate another market
      if (trend.tweet_id) {
        this.processedTweetIds.add(trend.tweet_id);
      }
      console.log(`[MarketAgent] ✅ Saved market to database: ${storedMarket.id}`);
    } catch (error) {
      console.error('[MarketAgent] Failed to save market to database:', error);
      // Don't throw - allow market generation to continue even if DB save fails
    }
  }
}