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
  private readonly MIN_VOLUME = 15000;
  private readonly EVENT_KEYWORDS = [
    'election', 'earnings', 'launch', 'release', 'announcement', 'merger',
    'ipo', 'conference', 'summit', 'vote', 'decision', 'verdict', 'result',
    'price', 'stock', 'crypto', 'bitcoin', 'ethereum', 'algorand'
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
    return trends
      .filter(trend => this.isValidTrend(trend))
      .map(trend => this.enrichTrend(trend))
      .filter(trend => trend.isEventBased)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5); // Top 5 filtered trends
  }

  private isValidTrend(trend: TrendData): boolean {
    // Volume check
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

    // Categorize trend
    if (this.containsKeywords(trendText, ['bitcoin', 'crypto', 'ethereum', 'algorand', 'defi', 'nft'])) {
      category = 'crypto';
      relevanceScore += 30;
    } else if (this.containsKeywords(trendText, ['stock', 'earnings', 'ipo', 'market', 'trading'])) {
      category = 'finance';
      relevanceScore += 25;
    } else if (this.containsKeywords(trendText, ['election', 'vote', 'politics', 'government'])) {
      category = 'politics';
      relevanceScore += 20;
    } else if (this.containsKeywords(trendText, ['tech', 'ai', 'launch', 'release', 'apple', 'google', 'tesla'])) {
      category = 'technology';
      relevanceScore += 25;
    } else if (this.containsKeywords(trendText, ['sports', 'game', 'match', 'championship', 'world cup'])) {
      category = 'sports';
      relevanceScore += 15;
    }

    // Check if event-based
    isEventBased = this.EVENT_KEYWORDS.some(keyword => 
      trendText.includes(keyword)
    );

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