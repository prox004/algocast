import { v4 as uuidv4 } from 'uuid';
import { MarketAgent } from '../agents/marketAgent';

const db = require('../db');

/**
 * AutoMarketGeneratorService
 * 
 * Periodically scans Twitter trends via AI agent and auto-generates
 * prediction markets that appear in the trading UI.
 * 
 * - Runs every N minutes (set via AUTO_MARKET_GEN_INTERVAL_MIN)
 * - Tracks generated market questions to avoid duplicates
 * - Stores AI probability and advisory data with each market
 */
export class AutoMarketGeneratorService {
  private marketAgent: MarketAgent;
  private generatedQuestions: Set<string> = new Set();
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.marketAgent = new MarketAgent();
    this.loadExistingMarkets();
  }

  /**
   * Load all existing market questions into memory to avoid duplicates
   */
  private loadExistingMarkets() {
    const markets = db.getAllMarkets?.() || [];
    markets.forEach((market: any) => {
      this.generatedQuestions.add(market.question);
    });
  }

  /**
   * Start auto-generation loop
   */
  public start() {
    if (this.isRunning) {
      console.log('[AutoMarketGen] Already running');
      return;
    }

    this.isRunning = true;
    const intervalMin = parseInt(process.env.AUTO_MARKET_GEN_INTERVAL_MIN || '5', 10);
    const intervalMs = Math.max(intervalMin * 60 * 1000, 1000); // min 1 second

    console.log(`[AutoMarketGen] Starting auto-generation loop every ${intervalMin} minutes`);

    // Run immediately once
    this.generateOnce().catch((err) => {
      console.error('[AutoMarketGen] Initial generation failed:', err.message);
    });

    // Then schedule recurring
    this.intervalId = setInterval(
      () => {
        this.generateOnce().catch((err) => {
          console.error('[AutoMarketGen] Generation cycle failed:', err.message);
        });
      },
      intervalMs
    );
  }

  /**
   * Stop auto-generation loop
   */
  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[AutoMarketGen] Stopped');
  }

  /**
   * Single generation cycle
   */
  private async generateOnce() {
    try {
      console.log('[AutoMarketGen] Starting cycle...');

      // Get up to 3 markets from current trends
      const result = await this.marketAgent.processMarketGeneration();

      if (result.error) {
        console.warn('[AutoMarketGen] Pipeline error:', result.error);
        return;
      }

      if (!result.generated_market) {
        console.log('[AutoMarketGen] No market generated in this cycle');
        return;
      }

      const market = result.generated_market;
      const probability = result.probability_estimate;
      const advisory = result.advisor_analysis;

      // Check for duplicate
      if (this.generatedQuestions.has(market.question)) {
        console.log('[AutoMarketGen] Question already exists, skipping:', market.question);
        return;
      }

      // Create in DB
      const expiryTs = market.expiry || Math.floor(Date.now() / 1000) + 48 * 3600; // 48h default

      const createdMarket = db.createMarket({
        id: uuidv4(),
        question: market.question,
        expiry: expiryTs,
        ai_probability: probability?.probability || 0.5,
        yes_asa_id: null,        // Mock mode (no on-chain ASAs)
        no_asa_id: null,
        yes_reserve: 0,
        no_reserve: 0,
        resolved: false,
        outcome: null,
        app_id: null,            // Mock mode (no on-chain contract)
        app_address: null,
        data_source: market.data_source || 'Twitter',
        ai_advisory: advisory?.advice || 'HOLD',
        created_by: 'AI_AGENT',
        created_at: Math.floor(Date.now() / 1000),
      });

      this.generatedQuestions.add(market.question);

      console.log('[AutoMarketGen] ✅ Market created:', {
        id: createdMarket.id,
        question: createdMarket.question,
        ai_probability: createdMarket.ai_probability,
      });
    } catch (err) {
      console.error('[AutoMarketGen] Error during cycle:', err instanceof Error ? err.message : String(err));
    }
  }
}

/**
 * Singleton instance
 */
let autoGenService: AutoMarketGeneratorService | null = null;

export function getAutoMarketGeneratorService(): AutoMarketGeneratorService {
  if (!autoGenService) {
    autoGenService = new AutoMarketGeneratorService();
  }
  return autoGenService;
}
