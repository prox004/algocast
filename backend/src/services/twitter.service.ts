import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';

interface TwitterTrend {
  name: string;
  tweet_volume: number | null;
  url: string;
}

interface TrendData {
  trend: string;
  volume: number;
  url: string;
  timestamp: number;
  tweet_id?: string;
  tweet_author?: string;
  tweet_content?: string;
}

// Influential accounts to monitor for prediction market signals
// Covers crypto, finance, tech, AI, and prediction-market influencers
const INFLUENTIAL_ACCOUNTS = [
  // ── Crypto & Web3 ──
  'VitalikButerin',     // Ethereum co-founder
  'caborosci',          // Crypto analyst (Kaleo)
  'CryptoCapo_',        // Crypto market analyst
  'inversebrah',        // Crypto trader / memes
  'coaborosci',         // Crypto analyst
  'aantonop',           // Andreas Antonopoulos – Bitcoin educator
  'CryptoCobain',       // Crypto trader
  'Algorand',           // Algorand official

  // ── Finance & Markets ──
  'jimcramer',          // Jim Cramer – CNBC Mad Money
  'unusual_whales',     // Options & stock flow tracking
  'zaborosci',          // Market analyst
  'DeItaone',           // Breaking market news (Walter Bloomberg)
  'elerianm',           // Mohamed El-Erian – Allianz chief advisor

  // ── Tech & AI ──
  'elonmusk',           // Tesla / SpaceX / X CEO
  'sataborosci',        // Tech analyst
  'sama',               // Sam Altman – OpenAI CEO
  'kaborosci',          // AI researcher
  'demaborosci',        // AI / ML researcher

  // ── Prediction Markets / General ──
  'Polymarket',         // Prediction market platform
  'ptoybuilds',         // Original account

  // ── News & Macro ──
  'disclosetv',         // Breaking news aggregator
  'BNONews',            // Breaking News
  'zaborosci',          // Macro analyst
];

/**
 * Parse a Twitter date string ("Sat Feb 28 12:34:56 +0000 2026") to a Unix ms timestamp.
 * Returns 0 if parsing fails.
 */
function parseTwitterDate(dateStr: string): number {
  if (!dateStr) return 0;
  const ms = Date.parse(dateStr);
  return isNaN(ms) ? 0 : ms;
}

export class TwitterService {
  private client?: TwitterApi;
  private rapidApiKey?: string;

  /**
   * Per-account cursor: only tweets whose created_at is AFTER this timestamp
   * (Unix ms) will be returned.
   * Initialised to Date.now() at service startup so we never replay old posts.
   */
  private accountSince: Map<string, number> = new Map();

  /**
   * Cycle counter for round-robin rotation through all accounts.
   * Ensures all accounts get checked, not just the first 10.
   */
  private cycleCount: number = 0;

  constructor() {
    const bearerToken = process.env.TWITTER_BEARER_TOKEN;
    this.rapidApiKey = process.env.RAPIDAPI_KEY;

    console.log('TwitterService constructor - Bearer token present:', !!bearerToken);
    console.log('TwitterService constructor - RapidAPI key present:', !!this.rapidApiKey);

    if (bearerToken) {
      this.client = new TwitterApi(bearerToken);
      console.log('Twitter client initialized successfully');
    } else {
      console.warn('TWITTER_BEARER_TOKEN not set, using mock data only');
    }

    // Look back 24 hours on startup to get recent tweets for market generation
    const lookbackMs = 24 * 60 * 60 * 1000; // 24 hours
    const startTime = Date.now() - lookbackMs;
    for (const account of INFLUENTIAL_ACCOUNTS) {
      this.accountSince.set(account, startTime);
    }
    console.log(`[TwitterService] Cursors initialised at ${new Date(startTime).toISOString()} for ${INFLUENTIAL_ACCOUNTS.length} accounts`);
  }

  /**
   * Fetch tweets from a user posted strictly after `sinceMs` (Unix ms).
   * Returns at most `maxResults` tweets sorted newest-first.
   */
  async getUserLatestTweets(username: string, maxResults: number = 10, sinceMs: number = 0) {
    try {
      if (!this.rapidApiKey) {
        console.log('No RapidAPI key available');
        return [];
      }

      console.log(`Fetching tweets for @${username} via RapidAPI (since ${new Date(sinceMs).toISOString()})...`);
      
      // Try user timeline endpoint first
      try {
        const timelineResponse = await axios.get('https://twitter-api45.p.rapidapi.com/timeline.php', {
          params: {
            screenname: username
          },
          headers: {
            'x-rapidapi-key': this.rapidApiKey,
            'x-rapidapi-host': 'twitter-api45.p.rapidapi.com'
          }
        });

        if (timelineResponse.data && timelineResponse.data.timeline) {
          const allTweets = timelineResponse.data.timeline;
          const newTweets = allTweets.filter(
            (t: any) => parseTwitterDate(t.created_at) > sinceMs
          );
          console.log(`@${username} timeline: ${allTweets.length} total, ${newTweets.length} new since cursor`);

          return newTweets.slice(0, maxResults).map((tweet: any) => ({
            id: tweet.tweet_id || tweet.id_str,
            text: tweet.text || tweet.full_text,
            created_at: tweet.created_at,
            user: {
              screen_name: tweet.screen_name || username,
              name: tweet.name || username
            },
            public_metrics: {
              like_count: tweet.favorites || tweet.favorite_count || 0,
              retweet_count: tweet.retweets || tweet.retweet_count || 0,
              reply_count: tweet.replies || tweet.reply_count || 0
            }
          }));
        }
      } catch (timelineError: any) {
        console.log(`Timeline endpoint failed, trying search: ${timelineError.message}`);
      }

      // Fallback: Search for user's tweets
      try {
        const searchResponse = await axios.get('https://twitter-api45.p.rapidapi.com/search.php', {
          params: {
            query: `from:${username}`,
            search_type: 'Latest'
          },
          headers: {
            'x-rapidapi-key': this.rapidApiKey,
            'x-rapidapi-host': 'twitter-api45.p.rapidapi.com'
          }
        });

        if (searchResponse.data && searchResponse.data.timeline) {
          const allTweets = searchResponse.data.timeline;
          const newTweets = allTweets.filter(
            (t: any) => parseTwitterDate(t.created_at) > sinceMs
          );
          console.log(`@${username} search: ${allTweets.length} total, ${newTweets.length} new since cursor`);

          return newTweets.slice(0, maxResults).map((tweet: any) => ({
            id: tweet.tweet_id || tweet.id_str,
            text: tweet.text || tweet.full_text,
            created_at: tweet.created_at,
            user: {
              screen_name: tweet.screen_name || username,
              name: tweet.name || username
            },
            public_metrics: {
              like_count: tweet.favorites || tweet.favorite_count || 0,
              retweet_count: tweet.retweets || tweet.retweet_count || 0,
              reply_count: tweet.replies || tweet.reply_count || 0
            }
          }));
        }
      } catch (searchError: any) {
        console.log(`Search endpoint also failed: ${searchError.message}`);
      }

      // Final fallback: Filter from trending posts
      console.log(`Falling back to trending posts filter for @${username}`);
      const trendingResponse = await axios.get('https://twitter-api45.p.rapidapi.com/top_posts.php', {
        params: {
          type: 'Likes',
          country: 'All',
          period: 'Daily'
        },
        headers: {
          'x-rapidapi-key': this.rapidApiKey,
          'x-rapidapi-host': 'twitter-api45.p.rapidapi.com'
        }
      });
      
      let posts = trendingResponse.data?.timeline || [];
      const filteredPosts = posts.filter((post: any) => {
        const postUsername = post.screen_name || post.user?.screen_name;
        const matchesUser = postUsername && postUsername.toLowerCase() === username.toLowerCase();
        const isNew = parseTwitterDate(post.created_at) > sinceMs;
        return matchesUser && isNew;
      });

      console.log(`Found ${filteredPosts.length} new posts from @${username} in trending (since cursor)`);

      return filteredPosts.slice(0, maxResults).map((post: any) => ({
        id: post.tweet_id || post.id_str,
        text: post.text || post.full_text,
        created_at: post.created_at,
        user: {
          screen_name: post.screen_name || username,
          name: post.name || username
        },
        public_metrics: {
          like_count: post.favorites || post.favorite_count || 0,
          retweet_count: post.retweets || post.retweet_count || 0,
          reply_count: post.replies || post.reply_count || 0
        }
      }));
    } catch (error: any) {
      console.error(`Error fetching tweets for @${username}:`, error.response?.data || error.message);
      return [];
    }
  }

  async getTrends(woeid: number = 1): Promise<TrendData[]> {
    console.log('getTrends called - client exists:', !!this.client);
    try {
      if (!this.client && !this.rapidApiKey) {
        console.error('❌ No Twitter API credentials configured. Cannot fetch real tweets.');
        console.error('   Set TWITTER_BEARER_TOKEN or RAPIDAPI_KEY in .env');
        return []; // Return empty array instead of mock data
      }

      console.log(`Fetching tweets from influential accounts...`);
      
      // Round-robin rotation through all accounts, checking 10 per cycle
      const accountsPerCycle = 10;
      const totalAccounts = INFLUENTIAL_ACCOUNTS.length;
      
      // Calculate which accounts to check in this cycle
      const startIdx = (this.cycleCount * accountsPerCycle) % totalAccounts;
      let accountsToCheck: string[] = [];
      
      // Handle wrapping: if we need accounts that wrap around the end
      if (startIdx + accountsPerCycle <= totalAccounts) {
        // Normal case: no wrapping
        accountsToCheck = INFLUENTIAL_ACCOUNTS.slice(startIdx, startIdx + accountsPerCycle);
      } else {
        // Wrapping case: get end of array + beginning of array
        accountsToCheck = [
          ...INFLUENTIAL_ACCOUNTS.slice(startIdx),
          ...INFLUENTIAL_ACCOUNTS.slice(0, (startIdx + accountsPerCycle) % totalAccounts)
        ];
      }
      
      console.log(`[TwitterService] Cycle ${this.cycleCount}: Checking accounts ${startIdx} to ${startIdx + accountsPerCycle - 1} (wrapped): ${accountsToCheck.join(', ')}`);
      
      // Increment cycle for next time
      this.cycleCount++;

      // Monitor influential accounts for prediction market opportunities
      const trends: TrendData[] = [];
      const cycleStart = Date.now();

      for (const username of accountsToCheck) {
        const sinceMs = this.accountSince.get(username) ?? cycleStart;

        try {
          const tweets = await this.getUserLatestTweets(username, 5, sinceMs);

          if (tweets.length > 0) {
            const latestTweet = tweets[0];
            const metrics = (latestTweet as any).public_metrics;
            const engagement = metrics
              ? metrics.like_count + metrics.retweet_count + metrics.reply_count
              : 0;

            // Advance cursor to the newest tweet's timestamp so duplicates are never replayed
            const newestTs = Math.max(
              ...tweets.map((t: any) => parseTwitterDate(t.created_at))
            );
            if (newestTs > sinceMs) {
              this.accountSince.set(username, newestTs);
              console.log(`[TwitterService] Cursor for @${username} advanced to ${new Date(newestTs).toISOString()}`);
            }

            // Use full tweet content for market generation, not truncated version
            const fullTweetText = (latestTweet as any).text || '';
            
            trends.push({
              trend: fullTweetText, // Use full tweet content for better market generation
              volume: engagement,
              url: `https://twitter.com/${username}/status/${(latestTweet as any).id}`,
              timestamp: cycleStart,
              tweet_id: (latestTweet as any).id,
              tweet_author: username,
              tweet_content: fullTweetText
            });
            
            console.log(`✅ [TwitterService] Found real tweet from @${username}: "${fullTweetText.substring(0, 100)}${fullTweetText.length > 100 ? '...' : ''}"`);
          } else {
            // No new tweets — advance cursor to cycle start so the same
            // empty window is never re-checked next cycle.
            this.accountSince.set(username, cycleStart);
            console.log(`[TwitterService] No new tweets from @${username} since cursor, cursor advanced to now`);
          }
        } catch (err) {
          console.error(`Error fetching tweets for @${username}:`, err);
        }

        // Small delay between accounts to respect RapidAPI rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Sort by engagement
      const sortedTrends = trends.sort((a, b) => b.volume - a.volume);
      
      if (sortedTrends.length > 0) {
        console.log(`✅ Fetched ${sortedTrends.length} REAL tweet-based trends this cycle`);
      } else {
        console.warn('⚠️  No new tweets found in this cycle');
      }

      return sortedTrends; // Return real data only, empty if none found
    } catch (error) {
      console.error('❌ Error fetching Twitter trends:', error);
      return []; // Return empty array on error, no mock data
    }
  }

  async searchRecentTweets(query: string, maxResults: number = 10) {
    try {
      if (!this.client) {
        console.warn('⚠️  No Twitter client available for search');
        return [];
      }
      
      const tweets = await this.client.v2.search(query, {
        max_results: maxResults,
        'tweet.fields': ['created_at', 'public_metrics', 'context_annotations']
      });
      
      return tweets.data || [];
    } catch (error) {
      console.error('Error searching tweets:', error);
      return [];
    }
  }
}