/**
 * Database Test Script
 * 
 * Run this to test the database functionality:
 * npx ts-node src/test-database.ts
 */

import { getDatabase, StoredMarket } from './services/database.service';
import { v4 as uuidv4 } from 'uuid';

async function testDatabase() {
  console.log('🧪 Testing Market Database...\n');

  const db = getDatabase();

  // Test 1: Create sample markets
  console.log('1️⃣  Creating sample markets...');
  
  const sampleMarkets: StoredMarket[] = [
    {
      id: uuidv4(),
      question: 'Will Bitcoin reach $100,000 by March 1, 2026?',
      data_source: 'CoinGecko API - Bitcoin USD price',
      expiry: new Date('2026-03-01T00:00:00Z').toISOString(),
      ai_probability: 0.65,
      confidence: 'high',
      reasoning: 'Based on current market trends and historical patterns',
      suggested_action: 'BUY',
      status: 'active',
      created_at: new Date().toISOString(),
      tweet_id: 'tweet123',
      tweet_author: 'ptoybuilds',
      tweet_content: '@ptoybuilds: Bitcoin looking strong! Could hit 100k soon.',
      category: 'crypto',
      volume: 1500
    },
    {
      id: uuidv4(),
      question: 'Will Ethereum maintain above $2,500 for next 48 hours?',
      data_source: 'Binance ETH/USD ticker',
      expiry: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      ai_probability: 0.72,
      confidence: 'medium',
      reasoning: 'Strong support levels and positive sentiment',
      suggested_action: 'HOLD',
      status: 'active',
      created_at: new Date().toISOString(),
      tweet_id: 'tweet456',
      tweet_author: 'ptoybuilds',
      tweet_content: '@ptoybuilds: ETH holding strong above key support.',
      category: 'crypto',
      volume: 2300
    },
    {
      id: uuidv4(),
      question: 'Will Solana (SOL) price reach $200 within 24 hours?',
      data_source: 'Coinbase SOL/USD price feed',
      expiry: new Date(Date.now() - 1000).toISOString(), // Already expired
      ai_probability: 0.45,
      confidence: 'low',
      reasoning: 'Significant price movement required in short timeframe',
      suggested_action: 'SELL',
      status: 'active',
      created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      tweet_id: 'tweet789',
      tweet_author: 'ptoybuilds',
      tweet_content: '@ptoybuilds: Solana showing some upward momentum.',
      category: 'crypto',
      volume: 890
    }
  ];

  for (const market of sampleMarkets) {
    db.saveMarket(market);
  }
  console.log(`✅ Created ${sampleMarkets.length} sample markets\n`);

  // Test 2: Get all markets
  console.log('2️⃣  Fetching all markets...');
  const allMarkets = db.getMarkets();
  console.log(`✅ Found ${allMarkets.length} total markets\n`);

  // Test 3: Get active markets only
  console.log('3️⃣  Fetching active markets...');
  const activeMarkets = db.getActiveMarkets();
  console.log(`✅ Found ${activeMarkets.length} active markets:`);
  activeMarkets.forEach(m => {
    console.log(`   - ${m.question.substring(0, 60)}...`);
  });
  console.log();

  // Test 4: Get expired markets
  console.log('4️⃣  Fetching expired markets...');
  const expiredMarkets = db.getExpiredMarkets();
  console.log(`✅ Found ${expiredMarkets.length} expired markets:`);
  expiredMarkets.forEach(m => {
    console.log(`   - ${m.question.substring(0, 60)}...`);
  });
  console.log();

  // Test 5: Full-text search
  console.log('5️⃣  Searching for "Bitcoin" markets...');
  const bitcoinMarkets = db.searchMarkets('Bitcoin');
  console.log(`✅ Found ${bitcoinMarkets.length} Bitcoin-related markets:`);
  bitcoinMarkets.forEach(m => {
    console.log(`   - ${m.question}`);
  });
  console.log();

  // Test 6: Filter by author
  console.log('6️⃣  Filtering markets by @ptoybuilds...');
  const ptoyMarkets = db.getMarkets({ tweet_author: 'ptoybuilds' });
  console.log(`✅ Found ${ptoyMarkets.length} markets from @ptoybuilds\n`);

  // Test 7: Auto-close expired markets
  console.log('7️⃣  Auto-closing expired markets...');
  const closedCount = db.autoCloseExpiredMarkets();
  console.log(`✅ Auto-closed ${closedCount} expired markets\n`);

  // Test 8: Resolve a market
  console.log('8️⃣  Resolving a market...');
  if (sampleMarkets[0]) {
    db.updateMarketStatus(sampleMarkets[0].id, 'resolved', 'yes');
    const resolved = db.getMarketById(sampleMarkets[0].id);
    console.log(`✅ Market resolved as: ${resolved?.result?.toUpperCase()}\n`);
  }

  // Test 9: Get statistics
  console.log('9️⃣  Fetching database statistics...');
  const stats = db.getStats();
  console.log('✅ Database Stats:');
  console.log(`   Total Markets: ${stats.total}`);
  console.log(`   Active: ${stats.active}`);
  console.log(`   Closed: ${stats.closed}`);
  console.log(`   Resolved: ${stats.resolved}`);
  console.log(`   By Category:`, stats.byCategory);
  console.log();

  // Test 10: Check for duplicate tweets
  console.log('🔟 Testing duplicate prevention...');
  const duplicate = db.marketExistsForTweet('tweet123');
  console.log(`✅ Market exists for tweet123: ${duplicate}\n`);

  console.log('✨ All tests completed successfully!\n');
  console.log('📁 Database file: backend/markets.db');
  console.log('🔍 You can browse it with DB Browser for SQLite\n');
}

// Run tests
testDatabase().catch(console.error);
