interface TrendData {
  trend: string;
  volume: number;
  url: string;
  timestamp: number;
}

interface FilteredTrend {
  trend: string;
  volume: number;
  category: string;
  relevanceScore: number;
  isEventBased: boolean;
}

export class TrendFilterService {
  private readonly MIN_VOLUME = 100; // Lowered for tweet-based trends
  private readonly EVENT_KEYWORDS = [
    'election', 'earnings', 'launch', 'release', 'announcement', 'merger',
    'ipo', 'conference', 'summit', 'vote', 'decision', 'verdict', 'result',
    'price', 'stock', 'crypto', 'bitcoin', 'ethereum', 'algorand',
    'down', 'up', 'surge', 'drop', 'rise', 'fall', 'gain', 'loss', 'percent', '%',
    'market', 'trading', 'buy', 'sell', 'will', 'predict', 'expect'
  ];
  
  private readonly EXCLUDED_PATTERNS = [
    /^#\w+Day$/i,           // #MondayMotivation, #ThrowbackThursday
    /^good\s+(morning|night)/i,
    /^happy\s+/i,
    /^thank\s+you/i,
    /^\d+\s*years?\s+ago/i,
    /^rip\s+/i,
    /^congratulations/i
  ];

  filterTrends(trends: TrendData[]): FilteredTrend[] {
    // Special hackathon mode: Accept ALL tweets from @ptoybuilds
    const ptoyTrends = trends.filter(t => t.trend.toLowerCase().includes('@ptoybuilds'));
    
    if (ptoyTrends.length > 0) {
      console.log(`[TrendFilter] 🎯 HACKATHON MODE: Found ${ptoyTrends.length} tweets from @ptoybuilds - bypassing all filters`);
      return ptoyTrends.map(trend => ({
        trend: trend.trend,
        volume: trend.volume || 1000, // Give it a default volume
        category: this.detectCategory(trend.trend),
        relevanceScore: 100, // Maximum priority
        isEventBased: true // Always treat as event-based
      }));
    }
    
    // Normal filtering for other accounts
    return trends
      .filter(trend => this.isValidTrend(trend))
      .map(trend => this.enrichTrend(trend))
      .filter(trend => trend.isEventBased)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5); // Top 5 filtered trends
  }

  private isValidTrend(trend: TrendData): boolean {
    // Special handling for tweets from influential accounts (start with @)
    if (trend.trend.startsWith('@')) {
      // Accept all tweets from influential accounts, no volume requirement
      return true;
    }

    // Volume check for generic trends
    if (trend.volume < this.MIN_VOLUME) {
      return false;
    }

    // Exclude common patterns
    const trendText = trend.trend.toLowerCase();
    for (const pattern of this.EXCLUDED_PATTERNS) {
      if (pattern.test(trendText)) {
        return false;
      }
    }

    // Must contain meaningful content (not just symbols)
    if (!/[a-zA-Z]/.test(trend.trend)) {
      return false;
    }

    return true;
  }

  private enrichTrend(trend: TrendData): FilteredTrend {
    const trendText = trend.trend.toLowerCase();
    let category = 'general';
    let relevanceScore = 0;
    let isEventBased = false;

    // Tweets from influential accounts are always event-based
    if (trend.trend.startsWith('@')) {
      isEventBased = true;
      relevanceScore += 50; // High priority for influential tweets
    }

    // Categorize trend
    if (this.containsKeywords(trendText, ['bitcoin', 'crypto', 'ethereum', 'algorand', 'defi', 'nft', 'btc', 'eth'])) {
      category = 'crypto';
      relevanceScore += 30;
    } else if (this.containsKeywords(trendText, ['stock', 'earnings', 'ipo', 'market', 'trading', 'nasdaq', 'sp500', 'dow'])) {
      category = 'finance';
      relevanceScore += 25;
    } else if (this.containsKeywords(trendText, ['nvidia', 'nvda', 'tesla', 'tsla', 'apple', 'aapl', 'google', 'msft', 'microsoft', 'meta', 'amazon'])) {
      category = 'technology';
      relevanceScore += 30;
    } else if (this.containsKeywords(trendText, ['election', 'vote', 'politics', 'government'])) {
      category = 'politics';
      relevanceScore += 20;
    } else if (this.containsKeywords(trendText, ['tech', 'ai', 'launch', 'release'])) {
      category = 'technology';
      relevanceScore += 25;
    } else if (this.containsKeywords(trendText, ['sports', 'game', 'match', 'championship', 'world cup'])) {
      category = 'sports';
      relevanceScore += 15;
    }

    // Check if event-based (unless already marked from influential account)
    if (!isEventBased) {
      isEventBased = this.EVENT_KEYWORDS.some(keyword => 
        trendText.includes(keyword)
      );
    }

    // Volume-based scoring
    relevanceScore += Math.min(trend.volume / 10000, 20);

    // Time-sensitive bonus
    const hoursOld = (Date.now() - trend.timestamp) / (1000 * 60 * 60);
    if (hoursOld < 2) {
      relevanceScore += 10;
    }

    return {
      trend: trend.trend,
      volume: trend.volume,
      category,
      relevanceScore,
      isEventBased
    };
  }

  private containsKeywords(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
  }

  private detectCategory(trendText: string): string {
    const text = trendText.toLowerCase();
    
    if (this.containsKeywords(text, ['nvidia', 'nvda', 'tesla', 'tsla', 'apple', 'aapl', 'google', 'msft', 'microsoft', 'meta', 'amazon', 'stock', 'shares'])) {
      return 'technology';
    }
    if (this.containsKeywords(text, ['bitcoin', 'crypto', 'ethereum', 'algorand', 'defi', 'nft', 'btc', 'eth'])) {
      return 'crypto';
    }
    if (this.containsKeywords(text, ['market', 'trading', 'earnings', 'ipo', 'nasdaq', 'sp500', 'dow'])) {
      return 'finance';
    }
    if (this.containsKeywords(text, ['ai', 'tech', 'launch', 'release', 'software', 'hardware'])) {
      return 'technology';
    }
    if (this.containsKeywords(text, ['election', 'vote', 'politics', 'government'])) {
      return 'politics';
    }
    if (this.containsKeywords(text, ['sports', 'game', 'match', 'championship'])) {
      return 'sports';
    }
    
    return 'general';
  }

  generateMarketableTopics(filteredTrends: FilteredTrend[]): string[] {
    return filteredTrends.map(trend => {
      const cleanTrend = trend.trend.replace(/^#/, '');
      
      switch (trend.category) {
        case 'crypto':
          return `Will ${cleanTrend} price increase by 5% in the next 24 hours?`;
        case 'finance':
          return `Will ${cleanTrend} stock price close higher today?`;
        case 'politics':
          return `Will ${cleanTrend} result in policy changes within 30 days?`;
        case 'technology':
          return `Will ${cleanTrend} announcement impact stock prices by market close?`;
        case 'sports':
          return `Will ${cleanTrend} event conclude with expected outcome?`;
        default:
          return `Will ${cleanTrend} trend continue for next 48 hours?`;
      }
    });
  }
}