import { chatCompletion, isGeminiReady } from './gemini';
import axios from 'axios';

interface NewsArticle {
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

interface SentimentResult {
  success: boolean;
  market_id: string;
  sentiment: {
    score: number;
    label: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number;
    momentum: 'RISING' | 'FALLING' | 'STABLE';
  };
  analysis: {
    ai_probability: number;
    crowd_probability: number;
    divergence: number;
    recommendation: 'BUY YES' | 'BUY NO' | 'HOLD';
  };
  sources: {
    news_count: number;
    social_mentions: number;
    trend_volume: number;
  };
  articles: NewsArticle[];
  summary: string;
  timestamp: number;
}

// ── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  result: SentimentResult;
  newsFingerprint: string;
  createdAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const NEWS_CHECK_INTERVAL_MS = 10 * 60 * 1000;

export class SentimentService {
  private newsApiKey?: string;
  private cache = new Map<string, CacheEntry>();
  private newsCheckTimestamps = new Map<string, number>();

  constructor() {
    this.newsApiKey = process.env.NEWS_API_KEY;
  }

  async analyze(marketId: string, question: string, crowdProbability: number): Promise<SentimentResult> {
    try {
      const now = Date.now();
      const cached = this.cache.get(marketId);

      // ── Fast-path: cache is fresh and within news-check window ───────────
      if (cached && (now - cached.createdAt) < CACHE_TTL_MS) {
        const lastCheck = this.newsCheckTimestamps.get(marketId) ?? 0;
        const needsNewsCheck = (now - lastCheck) >= NEWS_CHECK_INTERVAL_MS;

        if (!needsNewsCheck) {
          console.log(`[SentimentService] Cache HIT for ${marketId} (age ${Math.round((now - cached.createdAt) / 1000)}s)`);
          return {
            ...cached.result,
            analysis: {
              ...cached.result.analysis,
              crowd_probability: crowdProbability,
              divergence: Math.round(Math.abs(cached.result.analysis.ai_probability - crowdProbability) * 100),
              recommendation: this.generateRecommendation(
                cached.result.analysis.ai_probability,
                crowdProbability,
                Math.abs(cached.result.analysis.ai_probability - crowdProbability) * 100
              ),
            },
          };
        }

        // ── Soft-check: only fetch news to see if anything changed ─────────
        console.log(`[SentimentService] Checking for new news for ${marketId}...`);
        this.newsCheckTimestamps.set(marketId, now);

        const freshNews = await this.getNewsSentiment(question);
        const freshFingerprint = this.fingerprint(freshNews.articles);

        if (freshFingerprint === cached.newsFingerprint) {
          console.log(`[SentimentService] News unchanged → keeping cache for ${marketId}`);
          return {
            ...cached.result,
            analysis: {
              ...cached.result.analysis,
              crowd_probability: crowdProbability,
              divergence: Math.round(Math.abs(cached.result.analysis.ai_probability - crowdProbability) * 100),
              recommendation: this.generateRecommendation(
                cached.result.analysis.ai_probability,
                crowdProbability,
                Math.abs(cached.result.analysis.ai_probability - crowdProbability) * 100
              ),
            },
          };
        }

        console.log(`[SentimentService] New news detected → refreshing AI analysis for ${marketId}`);
        return this.runFullAnalysis(marketId, question, crowdProbability, freshNews);
      }

      // ── Cache miss or expired → full analysis ────────────────────────────
      console.log(`[SentimentService] Cache MISS for ${marketId} → running full analysis`);
      const newsSentiment = await this.getNewsSentiment(question);
      this.newsCheckTimestamps.set(marketId, now);
      return this.runFullAnalysis(marketId, question, crowdProbability, newsSentiment);
    } catch (error: any) {
      console.error('[SentimentService] Analysis error:', error);
      return this.getFallbackSentiment(marketId, question, crowdProbability);
    }
  }

  private fingerprint(articles: NewsArticle[]): string {
    return articles.map(a => a.title).sort().join('|');
  }

  private async runFullAnalysis(
    marketId: string,
    question: string,
    crowdProbability: number,
    newsSentiment: { score: number; confidence: number; articleCount: number; mentions: number; articles: NewsArticle[] }
  ): Promise<SentimentResult> {
    try {
      const aiAnalysis = await this.getAISentiment(question, newsSentiment.articles);

      const combinedScore = this.calculateCombinedSentiment(aiAnalysis.score, newsSentiment.score);
      const label = this.getSentimentLabel(combinedScore);
      const momentum = this.calculateMomentum(combinedScore, aiAnalysis.confidence);
      const aiProbability = this.sentimentToProbability(combinedScore);
      const divergence = Math.abs(aiProbability - crowdProbability) * 100;
      const recommendation = this.generateRecommendation(aiProbability, crowdProbability, divergence);

      const summary = aiAnalysis.reasoning
        ? `${label} sentiment. ${aiAnalysis.reasoning} AI: ${(aiProbability * 100).toFixed(1)}%, Market: ${(crowdProbability * 100).toFixed(1)}%. Momentum: ${momentum}.`
        : this.generateSummary(label, aiProbability, crowdProbability, divergence, momentum);

      const result: SentimentResult = {
        success: true,
        market_id: marketId,
        sentiment: {
          score: combinedScore,
          label,
          confidence: (aiAnalysis.confidence + newsSentiment.confidence) / 2,
          momentum
        },
        analysis: {
          ai_probability: aiProbability,
          crowd_probability: crowdProbability,
          divergence: Math.round(divergence),
          recommendation
        },
        sources: {
          news_count: newsSentiment.articleCount,
          social_mentions: newsSentiment.mentions,
          trend_volume: aiAnalysis.trendVolume
        },
        articles: newsSentiment.articles,
        summary,
        timestamp: Date.now()
      };

      this.cache.set(marketId, {
        result,
        newsFingerprint: this.fingerprint(newsSentiment.articles),
        createdAt: Date.now(),
      });

      if (this.cache.size > 100) {
        const oldest = [...this.cache.entries()]
          .sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
        if (oldest) this.cache.delete(oldest[0]);
      }

      return result;
    } catch (error: any) {
      console.error('[SentimentService] Full analysis error:', error);
      return this.getFallbackSentiment(marketId, question, crowdProbability);
    }
  }

  private parseJSON(text: string): any {
    const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    return JSON.parse(cleaned);
  }

  // ── STEP 1: AI understands MEANING of the question ────────────────────────

  private async understandQuestion(question: string): Promise<{
    topic: string;
    queries: string[];
    entities: string[];
    context: string;
  }> {
    if (!isGeminiReady()) {
      return this.understandQuestionFallback(question);
    }

    try {
      const prompt = `You are a news research assistant. Analyze this prediction market question and help me find RELEVANT news about it.

Question: "${question}"

Return a JSON object with:
- topic: one-sentence description of what this question is really about (the core event/subject)
- queries: array of 2-3 different NewsAPI search queries that would find articles DIRECTLY related to this topic. Each query should use NewsAPI advanced syntax (AND, OR, quotes for exact phrases). Make each query approach the topic from a different angle.
- entities: array of the key people, organizations, countries, or assets mentioned
- context: the broader geopolitical/financial/tech context this question fits into (one sentence)

IMPORTANT RULES:
- Queries must be SPECIFIC to the topic. For "Will Netanyahu confirm an Iranian attack?" → queries about Netanyahu + Iran + attack, NOT random world news.
- Use exact-match quotes for names: "Netanyahu", "Iran", "Bitcoin"
- Each query should be different but related: e.g., one about the main actors, one about the event, one about the context
- For crypto/stock questions: include ticker symbols and asset names
- For geopolitical questions: include country names and leader names

Respond with ONLY valid JSON, no markdown.`;

      const content = await chatCompletion(
        [{ role: 'user', content: prompt }],
        { temperature: 0.1, maxOutputTokens: 400 }
      );

      const parsed = this.parseJSON(content);
      console.log(`[SentimentService] AI topic understanding: ${parsed.topic}`);
      console.log(`[SentimentService] AI queries: ${JSON.stringify(parsed.queries)}`);

      return {
        topic: parsed.topic || question,
        queries: (parsed.queries || []).slice(0, 3),
        entities: parsed.entities || [],
        context: parsed.context || '',
      };
    } catch (error: any) {
      console.error('[SentimentService] AI meaning extraction error:', error);
      return this.understandQuestionFallback(question);
    }
  }

  private understandQuestionFallback(question: string): {
    topic: string;
    queries: string[];
    entities: string[];
    context: string;
  } {
    const stopCapitalized = new Set([
      'Will', 'The', 'Does', 'Can', 'Could', 'Should', 'What', 'How', 'When',
      'Where', 'Which', 'Who', 'Before', 'After', 'During', 'Within', 'Next',
      'This', 'That', 'These', 'Those', 'There',
    ]);

    const entities = question
      .split(/\s+/)
      .filter((w: string) => /^[A-Z]/.test(w) && w.length > 2 && !stopCapitalized.has(w))
      .map((w: string) => w.replace(/[^a-zA-Z0-9'-]/g, ''))
      .filter((w: string) => w.length > 2);

    const uniqueEntities = [...new Set(entities)];

    const queries: string[] = [];
    if (uniqueEntities.length >= 2) {
      queries.push(uniqueEntities.map(e => `"${e}"`).join(' AND '));
      queries.push(uniqueEntities.map(e => `"${e}"`).join(' OR '));
    } else if (uniqueEntities.length === 1) {
      queries.push(`"${uniqueEntities[0]}"`);
    }

    return {
      topic: question,
      queries,
      entities: uniqueEntities,
      context: '',
    };
  }

  // ── STEP 2: AI sentiment analysis ────────────────────────────────────────

  private async getAISentiment(
    question: string,
    newsArticles: NewsArticle[] = []
  ): Promise<{ score: number; confidence: number; trendVolume: number; reasoning: string }> {
    if (!isGeminiReady()) {
      return { score: 0, confidence: 0.5, trendVolume: 50000, reasoning: '' };
    }

    try {
      let newsContext = '';
      if (newsArticles.length > 0) {
        const headlines = newsArticles.slice(0, 10).map((a: NewsArticle, i: number) =>
          `${i + 1}. [${a.source}] "${a.title}" (${a.sentiment})`
        ).join('\n');
        newsContext = `\n\nREAL-TIME NEWS (fetched just now — use these to inform your analysis):\n${headlines}\n\nBase your analysis heavily on these real news articles. They represent the current state of events.`;
      } else {
        newsContext = '\n\nNo recent news articles were found for this topic. Base your analysis on general knowledge.';
      }

      const prompt = `You are an expert prediction market analyst. Analyze the likelihood of the following event based on the real news provided.

Prediction Market Question: "${question}"${newsContext}

Return a JSON object with:
- score: number from -1 (very unlikely) to 1 (very likely). Be precise.
- confidence: number from 0 to 1 (how confident you are, based on evidence quality)
- reasoning: 2-3 sentence explanation citing specific news articles that support your assessment

IMPORTANT:
- If news articles directly discuss the event, use them as primary evidence
- If news shows escalation/confirmation, score closer to 1
- If news shows de-escalation/denial, score closer to -1
- If news is mixed or indirect, stay closer to 0 with lower confidence
- Always cite which articles influenced your score

Respond with ONLY valid JSON, no markdown.`;

      const content = await chatCompletion(
        [{ role: 'user', content: prompt }],
        { temperature: 0.2, maxOutputTokens: 350 }
      );

      const parsed = this.parseJSON(content);
      console.log(`[SentimentService] AI news-informed analysis: score=${parsed.score}, confidence=${parsed.confidence}`);
      console.log(`[SentimentService] AI reasoning: ${parsed.reasoning}`);

      return {
        score: Math.max(-1, Math.min(1, parsed.score || 0)),
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        trendVolume: 75000,
        reasoning: parsed.reasoning || ''
      };
    } catch (error: any) {
      console.error('[SentimentService] AI sentiment error:', error);
      return { score: 0, confidence: 0.5, trendVolume: 50000, reasoning: '' };
    }
  }

  // ── STEP 3: Fetch news using meaning-derived queries ──────────────────────

  private async getNewsSentiment(
    question: string
  ): Promise<{ score: number; confidence: number; articleCount: number; mentions: number; articles: NewsArticle[] }> {
    if (!this.newsApiKey) {
      return { score: 0, confidence: 0.3, articleCount: 0, mentions: 0, articles: [] };
    }

    const understanding = await this.understandQuestion(question);

    if (understanding.queries.length === 0) {
      return { score: 0, confidence: 0.3, articleCount: 0, mentions: 0, articles: [] };
    }

    try {
      const allArticles: any[] = [];
      const seenUrls = new Set<string>();

      for (const query of understanding.queries) {
        try {
          const response = await axios.get('https://newsapi.org/v2/everything', {
            params: {
              q: query,
              language: 'en',
              sortBy: 'relevancy',
              pageSize: 15,
              apiKey: this.newsApiKey
            },
            timeout: 6000
          });

          for (const article of (response.data.articles || [])) {
            const url = article.url || '';
            if (!seenUrls.has(url)) {
              seenUrls.add(url);
              allArticles.push(article);
            }
          }
          console.log(`[SentimentService] Query "${query}" → ${response.data.articles?.length || 0} articles`);
        } catch (err: any) {
          console.warn(`[SentimentService] Query failed: "${query}"`);
        }
      }

      if (allArticles.length === 0) {
        return { score: 0, confidence: 0.3, articleCount: 0, mentions: 0, articles: [] };
      }

      const relevantArticles = await this.filterByRelevance(
        allArticles,
        understanding.topic,
        understanding.entities
      );

      return this.scoreSentiment(relevantArticles);
    } catch (error: any) {
      console.error('[SentimentService] News sentiment error:', error);
      return { score: 0, confidence: 0.3, articleCount: 0, mentions: 0, articles: [] };
    }
  }

  // ── STEP 4: AI-powered relevance filtering ───────────────────────────────

  private async filterByRelevance(
    articles: any[],
    topic: string,
    entities: string[]
  ): Promise<{ article: any; relevance: number; sentimentLabel: 'positive' | 'negative' | 'neutral' }[]> {
    const articleList = articles.slice(0, 25).map((a: any, i: number) => ({
      idx: i,
      title: (a.title || '').substring(0, 120),
      source: a.source?.name || 'Unknown',
    }));

    if (!isGeminiReady() || articleList.length === 0) {
      return this.fallbackRelevanceFilter(articles, entities);
    }

    try {
      const prompt = `You are evaluating news article relevance. I need articles about this topic:
"${topic}"
Key entities: ${entities.join(', ')}

Here are ${articleList.length} article headlines:
${articleList.map((a: any) => `[${a.idx}] "${a.title}" — ${a.source}`).join('\n')}

For EACH article, rate its relevance to the topic on a scale of 0-10:
- 10 = directly about the topic/event
- 5-9 = related to the topic/actors  
- 1-4 = tangentially related  
- 0 = completely unrelated

Also label each article's sentiment toward the topic: "positive" (supports YES outcome), "negative" (supports NO outcome), or "neutral".

Return a JSON array of objects with: { "idx": number, "relevance": number, "sentiment": "positive"|"negative"|"neutral" }
ONLY include articles with relevance >= 5. Omit irrelevant ones.
Respond with ONLY a valid JSON array, no markdown.`;

      const content = await chatCompletion(
        [{ role: 'user', content: prompt }],
        { temperature: 0.1, maxOutputTokens: 600 }
      );

      const ratings: { idx: number; relevance: number; sentiment: string }[] = this.parseJSON(content);

      const results: { article: any; relevance: number; sentimentLabel: 'positive' | 'negative' | 'neutral' }[] = [];

      for (const rating of ratings) {
        if (rating.relevance >= 5 && rating.idx < articles.length) {
          results.push({
            article: articles[rating.idx],
            relevance: rating.relevance,
            sentimentLabel: (['positive', 'negative', 'neutral'].includes(rating.sentiment)
              ? rating.sentiment
              : 'neutral') as 'positive' | 'negative' | 'neutral',
          });
        }
      }

      results.sort((a, b) => b.relevance - a.relevance);

      console.log(`[SentimentService] AI relevance filter: ${results.length} relevant out of ${articleList.length} evaluated`);
      return results;
    } catch (error: any) {
      console.error('[SentimentService] AI relevance filter error:', error);
      return this.fallbackRelevanceFilter(articles, entities);
    }
  }

  private fallbackRelevanceFilter(
    articles: any[],
    entities: string[]
  ): { article: any; relevance: number; sentimentLabel: 'positive' | 'negative' | 'neutral' }[] {
    const lowerEntities = entities.map((e: string) => e.toLowerCase());
    const results: { article: any; relevance: number; sentimentLabel: 'positive' | 'negative' | 'neutral' }[] = [];

    const positiveWords = ['confirm', 'approve', 'success', 'peace', 'deal', 'agreement', 'surge', 'rise', 'rally', 'gain'];
    const negativeWords = ['attack', 'war', 'conflict', 'threat', 'sanctions', 'strike', 'crash', 'drop', 'plunge', 'fail'];

    for (const article of articles) {
      const text = `${article.title || ''} ${article.description || ''}`.toLowerCase();

      const matchCount = lowerEntities.filter((ent: string) => text.includes(ent)).length;
      if (matchCount === 0) continue;

      const relevance = Math.min(10, matchCount * 4 + 2);

      const hasPositive = positiveWords.some(w => text.includes(w));
      const hasNegative = negativeWords.some(w => text.includes(w));
      let sentimentLabel: 'positive' | 'negative' | 'neutral' = 'neutral';
      if (hasPositive && !hasNegative) sentimentLabel = 'positive';
      else if (hasNegative && !hasPositive) sentimentLabel = 'negative';

      results.push({ article, relevance, sentimentLabel });
    }

    results.sort((a, b) => b.relevance - a.relevance);
    return results;
  }

  // ── STEP 5: Score sentiment on filtered articles ──────────────────────────

  private scoreSentiment(
    ratedArticles: { article: any; relevance: number; sentimentLabel: 'positive' | 'negative' | 'neutral' }[]
  ): { score: number; confidence: number; articleCount: number; mentions: number; articles: NewsArticle[] } {
    if (ratedArticles.length === 0) {
      return { score: 0, confidence: 0.3, articleCount: 0, mentions: 0, articles: [] };
    }

    let positiveCount = 0;
    let negativeCount = 0;
    const articles: NewsArticle[] = [];

    for (const { article, relevance, sentimentLabel } of ratedArticles.slice(0, 15)) {
      if (sentimentLabel === 'positive') positiveCount++;
      else if (sentimentLabel === 'negative') negativeCount++;

      articles.push({
        title: (article.title || 'Untitled').toString(),
        description: (article.description || '').toString(),
        source: article.source?.name || 'Unknown Source',
        url: article.url || '',
        publishedAt: article.publishedAt || new Date().toISOString(),
        sentiment: sentimentLabel,
      });
    }

    const total = ratedArticles.length;
    const score = total > 0 ? (positiveCount - negativeCount) / total : 0;

    console.log(`[SentimentService] Final: ${total} relevant articles | +${positiveCount} -${negativeCount} =${total - positiveCount - negativeCount} neutral`);

    return {
      score: Math.max(-1, Math.min(1, score)),
      confidence: Math.min(0.85, total / 8),
      articleCount: total,
      mentions: total,
      articles: articles.slice(0, 10),
    };
  }

  private calculateCombinedSentiment(aiScore: number, newsScore: number): number {
    return (aiScore * 0.7) + (newsScore * 0.3);
  }

  private getSentimentLabel(score: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    if (score > 0.2) return 'BULLISH';
    if (score < -0.2) return 'BEARISH';
    return 'NEUTRAL';
  }

  private calculateMomentum(score: number, confidence: number): 'RISING' | 'FALLING' | 'STABLE' {
    const strength = Math.abs(score) * confidence;
    if (strength > 0.5) {
      return score > 0 ? 'RISING' : 'FALLING';
    }
    return 'STABLE';
  }

  private sentimentToProbability(score: number): number {
    return 0.5 + (score * 0.25);
  }

  private generateRecommendation(aiProb: number, crowdProb: number, divergence: number): 'BUY YES' | 'BUY NO' | 'HOLD' {
    if (divergence < 10) return 'HOLD';
    if (aiProb > crowdProb) return 'BUY YES';
    return 'BUY NO';
  }

  private generateSummary(
    label: string,
    aiProb: number,
    crowdProb: number,
    divergence: number,
    momentum: string
  ): string {
    const aiPercent = (aiProb * 100).toFixed(1);
    const crowdPercent = (crowdProb * 100).toFixed(1);

    let summary = `${label} sentiment detected. `;
    summary += `AI analysis: ${aiPercent}%, Market: ${crowdPercent}%. `;

    if (divergence > 10) {
      summary += `Significant ${divergence.toFixed(0)}% divergence detected. `;
    }

    summary += `Momentum: ${momentum}.`;
    return summary;
  }

  private getFallbackSentiment(marketId: string, question: string, crowdProbability: number): SentimentResult {
    const text = question.toLowerCase();
    const bullishWords = ['increase', 'rise', 'gain', 'up', 'exceed', 'above', 'higher'];
    const bearishWords = ['decrease', 'fall', 'drop', 'down', 'below', 'lower'];

    let score = 0;
    bullishWords.forEach(word => { if (text.includes(word)) score += 0.2; });
    bearishWords.forEach(word => { if (text.includes(word)) score -= 0.2; });

    score = Math.max(-1, Math.min(1, score));
    const label = this.getSentimentLabel(score);
    const aiProbability = this.sentimentToProbability(score);
    const divergence = Math.abs(aiProbability - crowdProbability) * 100;

    return {
      success: true,
      market_id: marketId,
      sentiment: {
        score,
        label,
        confidence: 0.5,
        momentum: 'STABLE'
      },
      analysis: {
        ai_probability: aiProbability,
        crowd_probability: crowdProbability,
        divergence: Math.round(divergence),
        recommendation: this.generateRecommendation(aiProbability, crowdProbability, divergence)
      },
      sources: {
        news_count: 0,
        social_mentions: 0,
        trend_volume: 50000
      },
      articles: [],
      summary: `${label} sentiment (fallback analysis). AI: ${(aiProbability * 100).toFixed(1)}%, Market: ${(crowdProbability * 100).toFixed(1)}%.`,
      timestamp: Date.now()
    };
  }
}

// Singleton instance
let sentimentService: SentimentService | null = null;

export function getSentimentService(): SentimentService {
  if (!sentimentService) {
    sentimentService = new SentimentService();
  }
  return sentimentService;
}
