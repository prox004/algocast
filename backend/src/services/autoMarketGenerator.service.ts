import { v4 as uuidv4 } from 'uuid';
import { spawn, spawnSync } from 'child_process';
import * as path from 'path';
import { MarketAgent } from '../agents/marketAgent';
import { TwitterService } from './twitter.service';

// ── Python executable resolver ─────────────────────────────────────────────────

/**
 * Finds the first Python executable that actually works on this machine.
 * Returns a full absolute path so spawn() can call it directly without shell.
 * Order of preference: PYTHON_CMD env var → known absolute paths → PATH names.
 */
function resolvePython(): string {
  if (process.env.PYTHON_CMD) return process.env.PYTHON_CMD;

  // Full absolute paths first — these work without shell:true on Windows
  const candidates = [
    'C:\\Windows\\py.exe',            // Windows py launcher
    'C:\\Python313\\python.exe',      // Python 3.13 install on this machine
    'C:\\Python312\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Python310\\python.exe',
    // Per-user installs
    `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python313\\python.exe`,
    `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python312\\python.exe`,
    `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python311\\python.exe`,
    // PATH-based names (fallback — work only if PATH is inherited)
    'py',
    'python3',
    'python',
  ];

  for (const cmd of candidates) {
    if (!cmd) continue; // guard against undefined env vars
    try {
      const result = spawnSync(cmd, ['--version'], { timeout: 3000 });
      if (result.status === 0) {
        console.log(`[AutoMarketGen] Using Python: ${cmd}`);
        return cmd;
      }
    } catch {
      // try next
    }
  }

  throw new Error(
    'Python not found. Install Python 3 and ensure it is on PATH, or set PYTHON_CMD in backend/.env'
  );
}

let _pythonCmd: string | null = null;
function getPythonCmd(): string {
  if (!_pythonCmd) _pythonCmd = resolvePython();
  return _pythonCmd;
}

const db = require('../db');

// ── On-chain deployment helper ─────────────────────────────────────────────────

interface DeploymentResult {
  app_id: number;
  app_address: string;
  yes_asa_id: number;
  no_asa_id: number;
}

/**
 * Spawns deploy.py to create a real Algorand smart contract + YES/NO ASAs.
 * Returns the deployment info parsed from deploy.py's JSON output.
 */
function deployMarketOnChain(question: string, closeTs: number): Promise<DeploymentResult> {
  return new Promise((resolve, reject) => {
    // Works whether running via ts-node (src/services/) or compiled (dist/services/)
    // Both are 3 levels below the project root → ../../../contracts
    const contractsDir = path.resolve(__dirname, '../../../contracts');
    const scriptPath   = path.join(contractsDir, 'deploy.py');

    let pythonCmd: string;
    try {
      pythonCmd = getPythonCmd();
    } catch (err) {
      reject(err);
      return;
    }

    // shell: false (default) - arguments with spaces are passed as-is to Python,
    // no shell quoting/splitting issues. Requires pythonCmd to be a full absolute path.
    // PYTHONIOENCODING=utf-8 ensures Python stdout/stderr use UTF-8 regardless of
    // the Windows console codepage (cp1252) so Unicode chars in print() don't crash.
    const proc = spawn(
      pythonCmd,
      [scriptPath, '--question', question, '--close-ts', String(closeTs)],
      {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
        cwd: contractsDir,
      }
    );

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn deploy.py: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const error = stderr.trim();
        
        // Check for common wallet balance error
        if (error.includes('balance') && error.includes('below min')) {
          const match = error.match(/account (\w+) balance (\d+) below min (\d+)/);
          if (match) {
            const [, address, current, needed] = match;
            const currentAlgo = (parseInt(current) / 1_000_000).toFixed(3);
            const neededAlgo = (parseInt(needed) / 1_000_000).toFixed(3);
            console.error(`\n❌ Algorand Wallet Needs Funding:`);
            console.error(`   Current: ${currentAlgo} ALGO`);
            console.error(`   Needed:  ${neededAlgo} ALGO`);
            console.error(`\n💡 Get free TestNet ALGO:`);
            console.error(`   1. Visit: https://bank.testnet.algorand.network/`);
            console.error(`   2. Enter: ${address}`);
            console.error(`   3. Click "Dispense"\n`);
          }
        }
        
        reject(new Error(`deploy.py exited with code ${code}. stderr: ${error}`));
        return;
      }

      // deploy.py prints "Deployment summary:\n<json>" at the end
      const summaryIdx = stdout.indexOf('Deployment summary:');
      if (summaryIdx === -1) {
        reject(new Error(`deploy.py did not print "Deployment summary:". stdout: ${stdout.trim()}`));
        return;
      }

      try {
        // Extract JSON from the summary section
        let jsonStr = stdout.slice(summaryIdx + 'Deployment summary:'.length).trim();
        
        // Find the JSON object boundaries (starts with { and ends with })
        const jsonStart = jsonStr.indexOf('{');
        const jsonEnd = jsonStr.lastIndexOf('}');
        
        if (jsonStart === -1 || jsonEnd === -1) {
          throw new Error('No valid JSON object found in deploy.py output');
        }
        
        jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);
        const data = JSON.parse(jsonStr) as DeploymentResult;
        resolve(data);
      } catch (parseErr) {
        reject(new Error(`Failed to parse deploy.py JSON output: ${parseErr}`));
      }
    });
  });
}

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
  /**
   * Tracks tweet IDs that have already been turned into markets.
   * Prevents the same tweet from being deployed on-chain again if
   * the Twitter API returns it in a subsequent cycle.
   */
  private processedTweetIds: Set<string> = new Set();
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    // Share a single TwitterService instance so the cursor (accountSince)
    // persists across cycles and old tweets are never re-fetched.
    const sharedTwitterService = new TwitterService();
    this.marketAgent = new MarketAgent(sharedTwitterService);
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
    const intervalMin = parseInt(process.env.AUTO_MARKET_GEN_INTERVAL_MIN || '2', 10);
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
   * Single generation cycle — processes ALL new tweets found in this cycle
   */
  private async generateOnce() {
    try {
      console.log('\n🔄 [AutoMarketGen] Starting cycle...');
      console.log('   Scanning tweets from monitored influencers...');

      // Get markets from current trends
      const result = await this.marketAgent.processMarketGeneration();

      if (result.error) {
        console.error('❌ [AutoMarketGen] Pipeline error details:');
        console.error('   Error:', result.error);
        console.error('   Step:', result.step);
        console.error('   Generated Market:', result.generated_market ? { question: result.generated_market.question, expiry: result.generated_market.expiry } : 'none');
        console.error('   Probability:', result.probability_estimate);
        return;
      }

      if (!result.generated_market) {
        console.log('⚠️  [AutoMarketGen] No market generated in this cycle (no new tweets)');
        return;
      }

      const market = result.generated_market;
      const probability = result.probability_estimate;
      const advisory = result.advisor_analysis;

      // Extract tweet_id and category from the trend data that generated this market
      const topTrend = result.filtered_trends?.[0] || result.trends?.[0];
      const tweetId = topTrend?.tweet_id;
      const category = topTrend?.category || 'general';

      console.log('✅ [AutoMarketGen] Market generated from REAL tweet!');
      console.log(`   Question: "${market.question}"`);
      if (tweetId) {
        console.log(`   Tweet ID: ${tweetId}`);
      }

      // Check for duplicate by tweet ID first (most reliable)
      if (tweetId && this.processedTweetIds.has(tweetId)) {
        console.log(`⏭️  [AutoMarketGen] Tweet ${tweetId} already processed into a market, skipping`);
        return;
      }

      // Check for duplicate by question text
      if (this.generatedQuestions.has(market.question)) {
        console.log('⏭️  [AutoMarketGen] Question already exists, skipping');
        return;
      }

      // market.expiry may arrive as a Unix int, a numeric string, or an ISO date string
      const rawExpiry = market.expiry;
      let expiryTs: number;
      if (!rawExpiry) {
        expiryTs = Math.floor(Date.now() / 1000) + 48 * 3600; // 48h default
      } else if (typeof rawExpiry === 'number') {
        expiryTs = Math.floor(rawExpiry);
      } else {
        // Try parsing as integer first, then as a date string
        const asInt = parseInt(rawExpiry, 10);
        if (!isNaN(asInt) && String(asInt) === String(rawExpiry).trim()) {
          expiryTs = asInt;
        } else {
          const ms = Date.parse(rawExpiry);
          expiryTs = isNaN(ms)
            ? Math.floor(Date.now() / 1000) + 48 * 3600
            : Math.floor(ms / 1000);
        }
      }

      // Deploy on-chain: create smart contract + YES/NO ASAs
      console.log('[AutoMarketGen] Deploying on-chain contract for:', market.question);
      const deployment = await deployMarketOnChain(market.question, expiryTs);
      console.log('[AutoMarketGen] On-chain deployment complete:', {
        app_id:      deployment.app_id,
        yes_asa_id:  deployment.yes_asa_id,
        no_asa_id:   deployment.no_asa_id,
      });

      // Create in DB with real on-chain IDs
      const createdMarket = db.createMarket({
        id: uuidv4(),
        question: market.question,
        expiry: expiryTs,
        category: category,
        ai_probability: probability?.probability || 0.5,
        yes_asa_id:  deployment.yes_asa_id,
        no_asa_id:   deployment.no_asa_id,
        yes_reserve: 0,
        no_reserve: 0,
        resolved: false,
        outcome: null,
        app_id:      deployment.app_id,
        app_address: deployment.app_address,
        data_source: market.data_source || 'Twitter',
        ai_advisory: advisory?.advice || 'HOLD',
        created_by: 'AI_AGENT',
        created_at: Math.floor(Date.now() / 1000),
      });

      this.generatedQuestions.add(market.question);
      if (tweetId) {
        this.processedTweetIds.add(tweetId);
      }

      console.log('[AutoMarketGen] ✅ Market created:', {
        id: createdMarket.id,
        question: createdMarket.question,
        ai_probability: createdMarket.ai_probability,
        tweet_id: tweetId || 'N/A',
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
