import { TwitterApi } from 'twitter-api-v2';

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

  constructor() {
    const bearerToken = process.env.TWITTER_BEARER_TOKEN;
    if (bearerToken) {
      this.client = new TwitterApi(bearerToken);
    } else {
      console.warn('TWITTER_BEARER_TOKEN not set, using mock data only');
    }
  }

  async getTrends(woeid: number = 1): Promise<TrendData[]> {
    try {
      // For development, return mock data since Twitter API v2 doesn't have trends endpoint
      // In production, you would use Twitter API v1.1 for trends or alternative data sources
      console.log('Using mock Twitter trends data for development');
      return this.getMockTrends();
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