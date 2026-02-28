/**
 * sentiment.service.ts — Real-Time News Sentiment Analyzer Agent
 *
 * Fetches real news articles from multiple APIs, filters by market question
 * relevance, classifies sentiment via LLM, and returns a structured score.
 *
 * STRICT RULES:
 *  - No simulated / random sentiment
 *  - No hallucinated reasoning
 *  - Every score is backed by actual article headlines
 *  - Insufficient data → Neutral + Low confidence
 */

import axios from 'axios';
import OpenAI from 'openai';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface NewsArticle {
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  sentimentScore?: number; // -1 to +1
}

export interface SentimentResult {
  market_id: string;
  news_articles_analyzed: number;
  sentiment_score: number;           // -1 (very bearish) → +1 (very bullish)
  sentiment_label: 'Bullish' | 'Bearish' | 'Neutral';
  ai_probability_adjustment: number; // e.g. +0.06 or -0.04
  confidence: 'High' | 'Medium' | 'Low';
  momentum_indicator: 'Strong Upward Momentum' | 'Upward Momentum' | 'Stable' | 'Downward Momentum' | 'Strong Downward Momentum';
  explanation: string;
  articles: Pick<NewsArticle, 'title' | 'source' | 'url' | 'sentiment'>[];
  ai_probability: number;            // after adjustment
  market_probability: number;
  mispricing_percent: number;
  fetched_at: string;
}

interface KeywordSet {
  primary: string[];   // must-match (at least one)
  secondary: string[]; // boost relevance
  entities: string[];  // named entities
}

// ── Sentiment History (in-memory, per market) ───────────────────────────────

interface HistoryEntry {
  timestamp: number;
  score: number;
}
const sentimentHistory: Map<string, HistoryEntry[]> = new Map();

const MAX_HISTORY = 50; // keep last 50 data points per market

function recordHistory(marketId: string, score: number) {
  if (!sentimentHistory.has(marketId)) sentimentHistory.set(marketId, []);
  const list = sentimentHistory.get(marketId)!;
  list.push({ timestamp: Date.now(), score });
  if (list.length > MAX_HISTORY) list.shift();
}

function getMomentum(marketId: string, currentScore: number): SentimentResult['momentum_indicator'] {
  const list = sentimentHistory.get(marketId);
  if (!list || list.length < 2) return 'Stable';

  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
  const recentEntries = list.filter(e => e.timestamp > sixHoursAgo);
  if (recentEntries.length < 2) return 'Stable';

  const oldScore = recentEntries[0].score;
  const delta = currentScore - oldScore;

  if (delta > 0.3)  return 'Strong Upward Momentum';
  if (delta > 0.1)  return 'Upward Momentum';
  if (delta < -0.3) return 'Strong Downward Momentum';
  if (delta < -0.1) return 'Downward Momentum';
  return 'Stable';
}

// ── Service ─────────────────────────────────────────────────────────────────

export class SentimentService {
  private openai?: OpenAI;
  private newsApiKey?: string;
  private gnewsApiKey?: string;

  constructor() {
    const aiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
    if (aiKey) {
      this.openai = new OpenAI({
        apiKey: aiKey,
        baseURL: process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : undefined,
      });
    }
    this.newsApiKey = process.env.NEWS_API_KEY;
    this.gnewsApiKey = process.env.GNEWS_API_KEY;

    console.log('[SentimentService] Initialised — NewsAPI:', !!this.newsApiKey, '| GNews:', !!this.gnewsApiKey, '| AI:', !!this.openai);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PUBLIC: Main entry point
  // ──────────────────────────────────────────────────────────────────────────

  async analyze(marketId: string, question: string, marketProbability: number): Promise<SentimentResult> {
    console.log(`[Sentiment] Analyzing: "${question}"`);

    // 1. Extract keywords from the market question
    const keywords = await this.extractKeywords(question);
    console.log(`[Sentiment] Keywords:`, keywords);

    // 2. Fetch real news from multiple sources
    const rawArticles = await this.fetchRealTimeNews(keywords);
    console.log(`[Sentiment] Raw articles fetched: ${rawArticles.length}`);

    // 3. Deduplicate
    const articles = this.deduplicateArticles(rawArticles);
    console.log(`[Sentiment] After dedup: ${articles.length}`);

    // 4. If insufficient data → return Neutral / Low confidence immediately
    if (articles.length === 0) {
      return this.buildInsufficientDataResult(marketId, marketProbability);
    }

    // 5. Classify sentiment for each article
    const classified = await this.analyzeArticleSentiment(articles, question);

    // 6. Compute aggregate score
    const { score, label } = this.computeSentimentScore(classified);

    // 7. Probability adjustment
    const adjustment = score * 0.10; // ±10 % max swing
    const aiProb = Math.max(0.01, Math.min(0.99, marketProbability + adjustment));

    // 8. Momentum
    recordHistory(marketId, score);
    const momentum = getMomentum(marketId, score);

    // 9. Confidence
    const confidence = this.computeConfidence(classified);

    // 10. Explanation
    const explanation = await this.generateExplanation(question, classified, score, label, momentum);

    const result: SentimentResult = {
      market_id: marketId,
      news_articles_analyzed: classified.length,
      sentiment_score: parseFloat(score.toFixed(3)),
      sentiment_label: label,
      ai_probability_adjustment: parseFloat(adjustment.toFixed(4)),
      confidence,
      momentum_indicator: momentum,
      explanation,
      articles: classified.slice(0, 10).map(a => ({
        title: a.title,
        source: a.source,
        url: a.url,
        sentiment: a.sentiment,
      })),
      ai_probability: parseFloat(aiProb.toFixed(4)),
      market_probability: marketProbability,
      mispricing_percent: parseFloat(((aiProb - marketProbability) * 100).toFixed(2)),
      fetched_at: new Date().toISOString(),
    };

    console.log(`[Sentiment] Result — score: ${result.sentiment_score}, label: ${result.sentiment_label}, articles: ${result.news_articles_analyzed}`);
    return result;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 1: Extract keywords from market question
  // ──────────────────────────────────────────────────────────────────────────

  private async extractKeywords(question: string): Promise<KeywordSet> {
    // Try LLM extraction first
    if (this.openai) {
      try {
        const resp = await this.openai.chat.completions.create({
          model: process.env.OPENROUTER_API_KEY ? 'meta-llama/llama-3.1-8b-instruct' : 'gpt-4o-mini',
          temperature: 0,
          messages: [
            {
              role: 'system',
              content: `You extract search keywords from prediction market questions.
Return ONLY valid JSON — no markdown, no explanation.
Schema: { "primary": string[], "secondary": string[], "entities": string[] }
- primary: 2-4 core topic keywords (e.g. "Bitcoin", "price", "$100k")
- secondary: 2-4 context keywords (e.g. "crypto", "market", "rally")
- entities: named people / companies / countries mentioned`,
            },
            { role: 'user', content: question },
          ],
        });
        const text = resp.choices[0]?.message?.content?.trim() || '';
        // Strip markdown fences if present
        const json = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(json) as KeywordSet;
        if (parsed.primary?.length) return parsed;
      } catch (err) {
        console.warn('[Sentiment] LLM keyword extraction failed, using fallback:', err instanceof Error ? err.message : err);
      }
    }

    // Fallback: simple regex-based extraction
    return this.fallbackKeywordExtraction(question);
  }

  private fallbackKeywordExtraction(question: string): KeywordSet {
    const stopwords = new Set([
      'will', 'the', 'a', 'an', 'is', 'are', 'was', 'be', 'by', 'to', 'in',
      'of', 'for', 'on', 'at', 'from', 'with', 'this', 'that', 'it', 'its',
      'before', 'after', 'above', 'below', 'more', 'than', 'within', 'next',
      'does', 'do', 'did', 'have', 'has', 'had', 'go', 'going', 'yes', 'no',
    ]);

    const words = question
      .replace(/[?!.,;:'"(){}[\]]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1)
      .filter(w => !stopwords.has(w.toLowerCase()));

    // Capitalised words are likely entities
    const entities = words.filter(w => /^[A-Z]/.test(w) && w.length > 2);
    // Numbers / $ amounts
    const amounts = question.match(/\$[\d,.]+[kKmMbB]?|\d+%/g) || [];

    return {
      primary: [...new Set([...entities.slice(0, 4), ...amounts.slice(0, 2)])],
      secondary: words.filter(w => !entities.includes(w)).slice(0, 4),
      entities,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 2: Fetch real-time news from multiple APIs
  // ──────────────────────────────────────────────────────────────────────────

  async fetchRealTimeNews(keywords: KeywordSet): Promise<NewsArticle[]> {
    const query = [...keywords.primary, ...keywords.entities.slice(0, 2)].join(' ');
    if (!query.trim()) return [];

    // Fire all sources in parallel
    const [newsApi, gnews, googleRss] = await Promise.allSettled([
      this.fetchFromNewsAPI(query),
      this.fetchFromGNews(query),
      this.fetchFromGoogleNewsRSS(query),
    ]);

    const results: NewsArticle[] = [];
    if (newsApi.status === 'fulfilled') results.push(...newsApi.value);
    if (gnews.status === 'fulfilled') results.push(...gnews.value);
    if (googleRss.status === 'fulfilled') results.push(...googleRss.value);

    console.log(`[Sentiment] Sources — NewsAPI: ${newsApi.status === 'fulfilled' ? newsApi.value.length : 'ERR'}, GNews: ${gnews.status === 'fulfilled' ? gnews.value.length : 'ERR'}, GoogleRSS: ${googleRss.status === 'fulfilled' ? googleRss.value.length : 'ERR'}`);

    return results;
  }

  /** NewsAPI.org — requires NEWS_API_KEY */
  private async fetchFromNewsAPI(query: string): Promise<NewsArticle[]> {
    if (!this.newsApiKey) return [];
    try {
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const resp = await axios.get('https://newsapi.org/v2/everything', {
        params: {
          q: query,
          from: since,
          sortBy: 'publishedAt',
          pageSize: 30,
          language: 'en',
          apiKey: this.newsApiKey,
        },
        timeout: 10000,
      });
      return (resp.data.articles || []).map((a: any) => ({
        title: a.title || '',
        description: a.description || '',
        source: a.source?.name || 'Unknown',
        url: a.url || '',
        publishedAt: a.publishedAt || '',
      }));
    } catch (err: any) {
      console.warn('[Sentiment] NewsAPI error:', err.response?.data?.message || err.message);
      return [];
    }
  }

  /** GNews.io — requires GNEWS_API_KEY */
  private async fetchFromGNews(query: string): Promise<NewsArticle[]> {
    if (!this.gnewsApiKey) return [];
    try {
      const resp = await axios.get('https://gnews.io/api/v4/search', {
        params: {
          q: query,
          lang: 'en',
          max: 20,
          sortby: 'publishedAt',
          token: this.gnewsApiKey,
        },
        timeout: 10000,
      });
      return (resp.data.articles || []).map((a: any) => ({
        title: a.title || '',
        description: a.description || '',
        source: a.source?.name || 'Unknown',
        url: a.url || '',
        publishedAt: a.publishedAt || '',
      }));
    } catch (err: any) {
      console.warn('[Sentiment] GNews error:', err.response?.data?.errors || err.message);
      return [];
    }
  }

  /** Google News RSS — no API key required (free fallback) */
  private async fetchFromGoogleNewsRSS(query: string): Promise<NewsArticle[]> {
    try {
      const encoded = encodeURIComponent(query);
      const url = `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;
      const resp = await axios.get(url, { timeout: 10000, responseType: 'text' });
      const xml: string = resp.data;

      // Lightweight XML parsing (no extra dependency)
      const items: NewsArticle[] = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match: RegExpExecArray | null;
      while ((match = itemRegex.exec(xml)) !== null && items.length < 25) {
        const block = match[1];
        const title = this.xmlTag(block, 'title');
        const link = this.xmlTag(block, 'link');
        const pubDate = this.xmlTag(block, 'pubDate');
        const source = this.xmlTag(block, 'source') || 'Google News';

        if (title) {
          items.push({
            title,
            description: '',
            source,
            url: link,
            publishedAt: pubDate ? new Date(pubDate).toISOString() : '',
          });
        }
      }
      return items;
    } catch (err: any) {
      console.warn('[Sentiment] Google News RSS error:', err.message);
      return [];
    }
  }

  /** Helper: extract text between XML tags */
  private xmlTag(block: string, tag: string): string {
    const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, 'i');
    const m = re.exec(block);
    return m ? m[1].trim() : '';
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 3: Deduplicate articles
  // ──────────────────────────────────────────────────────────────────────────

  private deduplicateArticles(articles: NewsArticle[]): NewsArticle[] {
    const seen = new Set<string>();
    return articles.filter(a => {
      // Normalise title to catch near-duplicates
      const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 60);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 4: Classify each article's sentiment via LLM
  // ──────────────────────────────────────────────────────────────────────────

  async analyzeArticleSentiment(articles: NewsArticle[], marketQuestion: string): Promise<NewsArticle[]> {
    if (!this.openai) {
      // Fallback: keyword-based sentiment
      return articles.map(a => this.keywordSentiment(a));
    }

    // Batch articles into chunks of 15 for efficient LLM calls
    const batchSize = 15;
    const batches: NewsArticle[][] = [];
    for (let i = 0; i < articles.length; i += batchSize) {
      batches.push(articles.slice(i, i + batchSize));
    }

    const classified: NewsArticle[] = [];

    for (const batch of batches) {
      try {
        const headlines = batch.map((a, i) => `${i + 1}. [${a.source}] ${a.title}`).join('\n');

        const resp = await this.openai.chat.completions.create({
          model: process.env.OPENROUTER_API_KEY ? 'meta-llama/llama-3.1-8b-instruct' : 'gpt-4o-mini',
          temperature: 0,
          messages: [
            {
              role: 'system',
              content: `You are a financial sentiment classifier.

Given a prediction market question and a list of news headlines, classify each headline's sentiment WITH RESPECT TO the market question outcome being YES.

Return ONLY a JSON array of objects: [{"i":1,"s":"positive"},{"i":2,"s":"negative"},...]
- "positive" = headline supports YES outcome (bullish)
- "negative" = headline supports NO outcome (bearish)
- "neutral" = headline is irrelevant or mixed

No explanation, no markdown — just the JSON array.`,
            },
            {
              role: 'user',
              content: `Market question: "${marketQuestion}"\n\nHeadlines:\n${headlines}`,
            },
          ],
        });

        const text = resp.choices[0]?.message?.content?.trim() || '[]';
        const json = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const results: { i: number; s: string }[] = JSON.parse(json);

        for (const r of results) {
          const article = batch[r.i - 1];
          if (article) {
            article.sentiment = r.s === 'positive' ? 'positive' : r.s === 'negative' ? 'negative' : 'neutral';
            article.sentimentScore = r.s === 'positive' ? 1 : r.s === 'negative' ? -1 : 0;
            classified.push(article);
          }
        }

        // If some articles weren't in the response, mark them neutral
        for (const a of batch) {
          if (a.sentiment === undefined) {
            a.sentiment = 'neutral';
            a.sentimentScore = 0;
            classified.push(a);
          }
        }
      } catch (err) {
        console.warn('[Sentiment] LLM batch classification failed, using keyword fallback:', err instanceof Error ? err.message : err);
        classified.push(...batch.map(a => this.keywordSentiment(a)));
      }
    }

    return classified;
  }

  /** Fallback keyword-based sentiment when LLM is unavailable */
  private keywordSentiment(article: NewsArticle): NewsArticle {
    const text = `${article.title} ${article.description}`.toLowerCase();

    const positiveWords = ['surge', 'rally', 'soar', 'gain', 'jump', 'rise', 'bull', 'boost', 'record', 'breakthrough', 'optimis', 'growth', 'up', 'high', 'strong', 'beat', 'exceed', 'approve'];
    const negativeWords = ['crash', 'plunge', 'drop', 'fall', 'bear', 'decline', 'loss', 'fear', 'concern', 'risk', 'down', 'low', 'weak', 'miss', 'reject', 'ban', 'crisis', 'fail', 'collapse'];

    let score = 0;
    for (const w of positiveWords) { if (text.includes(w)) score += 1; }
    for (const w of negativeWords) { if (text.includes(w)) score -= 1; }

    article.sentimentScore = score > 0 ? 1 : score < 0 ? -1 : 0;
    article.sentiment = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
    return article;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 5: Compute aggregate sentiment score
  // ──────────────────────────────────────────────────────────────────────────

  computeSentimentScore(articles: NewsArticle[]): { score: number; label: SentimentResult['sentiment_label'] } {
    if (articles.length === 0) return { score: 0, label: 'Neutral' };

    const total = articles.reduce((sum, a) => sum + (a.sentimentScore ?? 0), 0);
    const score = total / articles.length; // normalised -1 to +1

    const label: SentimentResult['sentiment_label'] =
      score > 0.1 ? 'Bullish' : score < -0.1 ? 'Bearish' : 'Neutral';

    return { score, label };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Confidence level
  // ──────────────────────────────────────────────────────────────────────────

  private computeConfidence(articles: NewsArticle[]): SentimentResult['confidence'] {
    const count = articles.length;
    if (count >= 30) {
      // Also check consistency
      const positive = articles.filter(a => a.sentiment === 'positive').length;
      const negative = articles.filter(a => a.sentiment === 'negative').length;
      const dominant = Math.max(positive, negative);
      const consistency = count > 0 ? dominant / count : 0;
      return consistency > 0.6 ? 'High' : 'Medium';
    }
    if (count >= 15) return 'Medium';
    return 'Low';
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Generate human-readable explanation
  // ──────────────────────────────────────────────────────────────────────────

  private async generateExplanation(
    question: string,
    articles: NewsArticle[],
    score: number,
    label: string,
    momentum: string,
  ): Promise<string> {
    const positive = articles.filter(a => a.sentiment === 'positive').length;
    const negative = articles.filter(a => a.sentiment === 'negative').length;
    const neutral  = articles.filter(a => a.sentiment === 'neutral').length;

    // Top headlines for context
    const topPositive = articles.filter(a => a.sentiment === 'positive').slice(0, 2).map(a => `"${a.title}"`);
    const topNegative = articles.filter(a => a.sentiment === 'negative').slice(0, 2).map(a => `"${a.title}"`);

    if (this.openai) {
      try {
        const resp = await this.openai.chat.completions.create({
          model: process.env.OPENROUTER_API_KEY ? 'meta-llama/llama-3.1-8b-instruct' : 'gpt-4o-mini',
          temperature: 0.3,
          max_tokens: 200,
          messages: [
            {
              role: 'system',
              content: 'You write concise 2-3 sentence explanations of news sentiment for prediction market traders. Be factual — reference the actual headline counts and give the key takeaway. No hype.',
            },
            {
              role: 'user',
              content: `Market: "${question}"
Analysed ${articles.length} articles. ${positive} positive, ${negative} negative, ${neutral} neutral.
Sentiment: ${label} (${score.toFixed(2)}). Momentum: ${momentum}.
Top bullish headlines: ${topPositive.join('; ') || 'none'}
Top bearish headlines: ${topNegative.join('; ') || 'none'}

Write the explanation.`,
            },
          ],
        });
        return resp.choices[0]?.message?.content?.trim() || this.fallbackExplanation(articles.length, positive, negative, label);
      } catch {
        // fall through
      }
    }

    return this.fallbackExplanation(articles.length, positive, negative, label);
  }

  private fallbackExplanation(total: number, positive: number, negative: number, label: string): string {
    return `Based on ${total} recent news articles, ${positive} were positive and ${negative} were negative toward this outcome. Overall sentiment is ${label}.`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Insufficient data result
  // ──────────────────────────────────────────────────────────────────────────

  private buildInsufficientDataResult(marketId: string, marketProb: number): SentimentResult {
    return {
      market_id: marketId,
      news_articles_analyzed: 0,
      sentiment_score: 0,
      sentiment_label: 'Neutral',
      ai_probability_adjustment: 0,
      confidence: 'Low',
      momentum_indicator: 'Stable',
      explanation: 'Insufficient news data available for this market topic. Sentiment is Neutral with low confidence.',
      articles: [],
      ai_probability: marketProb,
      market_probability: marketProb,
      mispricing_percent: 0,
      fetched_at: new Date().toISOString(),
    };
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let instance: SentimentService | null = null;

export function getSentimentService(): SentimentService {
  if (!instance) instance = new SentimentService();
  return instance;
}
