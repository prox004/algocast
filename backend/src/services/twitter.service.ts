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
}

export class TwitterService {
  private client?: TwitterApi;
  private rapidApiKey?: string;

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
  }

  async getUserLatestTweets(username: string, maxResults: number = 10) {
    try {
      if (!this.rapidApiKey) {
        console.log('No RapidAPI key available');
        return [];
      }

      console.log(`Fetching tweets for @${username} via RapidAPI...`);
      
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
          const tweets = timelineResponse.data.timeline;
          console.log(`Fetched ${tweets.length} tweets from @${username}'s timeline`);
          
          return tweets.slice(0, maxResults).map((tweet: any) => ({
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
          const tweets = searchResponse.data.timeline;
          console.log(`Found ${tweets.length} tweets from @${username} via search`);
          
          return tweets.slice(0, maxResults).map((tweet: any) => ({
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
        return postUsername && postUsername.toLowerCase() === username.toLowerCase();
      });
      
      console.log(`Found ${filteredPosts.length} posts from @${username} in trending`);
      
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
      if (!this.client) {
        console.log('No Twitter client, using mock data');
        return this.getMockTrends();
      }

      console.log('Fetching tweets from influential accounts...');
      
      // Monitor influential accounts for prediction market opportunities
      const influentialAccounts = ['elonmusk', 'VitalikButerin', 'cz_binance', 'SBF_FTX', 'APompliano'];
      const trends: TrendData[] = [];
      
      for (const username of influentialAccounts.slice(0, 3)) {
        try {
          const tweets = await this.getUserLatestTweets(username, 5);
          
          if (tweets.length > 0) {
            const latestTweet = tweets[0];
            const metrics = (latestTweet as any).public_metrics;
            const engagement = metrics ? 
              metrics.like_count + metrics.retweet_count + metrics.reply_count : 0;
            
            trends.push({
              trend: `@${username}: ${(latestTweet.text || '').substring(0, 50)}...`,
              volume: engagement,
              url: `https://twitter.com/${username}`,
              timestamp: Date.now()
            });
          }
        } catch (err) {
          console.error(`Error fetching tweets for @${username}:`, err);
        }
      }
      
      // Sort by engagement
      const sortedTrends = trends.sort((a, b) => b.volume - a.volume);
      console.log(`Fetched ${sortedTrends.length} real tweet-based trends`);
      
      return sortedTrends.length > 0 ? sortedTrends : this.getMockTrends();
    } catch (error) {
      console.error('Error fetching Twitter trends:', error);
      return this.getMockTrends();
    }
  }

  async searchRecentTweets(query: string, maxResults: number = 10) {
    try {
      if (!this.client) {
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

  private getMockTrends(): TrendData[] {
    const mockTrends = [
      { trend: '#Bitcoin', volume: 125000, url: 'https://twitter.com/search?q=%23Bitcoin', timestamp: Date.now() },
      { trend: '#AI', volume: 89000, url: 'https://twitter.com/search?q=%23AI', timestamp: Date.now() },
      { trend: '#Tesla', volume: 67000, url: 'https://twitter.com/search?q=%23Tesla', timestamp: Date.now() },
      { trend: '#Algorand', volume: 45000, url: 'https://twitter.com/search?q=%23Algorand', timestamp: Date.now() },
      { trend: '#NFT', volume: 34000, url: 'https://twitter.com/search?q=%23NFT', timestamp: Date.now() }
    ];
    
    return mockTrends;
  }
}