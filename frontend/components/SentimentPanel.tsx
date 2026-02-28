'use client';

import { useEffect, useState } from 'react';
import {
  getSentimentAnalysis,
  formatProb,
  type SentimentResult,
  type SentimentArticle,
} from '@/lib/api';

interface Props {
  marketId: string;
}

// ── Colour / icon helpers ────────────────────────────────────────────────────

const labelStyle: Record<string, string> = {
  Bullish: 'text-emerald-400',
  Bearish: 'text-red-400',
  Neutral: 'text-yellow-400',
};

const labelBg: Record<string, string> = {
  Bullish: 'bg-emerald-900/40 border-emerald-700/50',
  Bearish: 'bg-red-900/40 border-red-700/50',
  Neutral: 'bg-yellow-900/40 border-yellow-700/50',
};

const confidenceStyle: Record<string, string> = {
  High: 'text-emerald-400',
  Medium: 'text-yellow-400',
  Low: 'text-gray-500',
};

const momentumIcon: Record<string, string> = {
  'Strong Upward Momentum': '⬆⬆',
  'Upward Momentum': '⬆',
  Stable: '➡',
  'Downward Momentum': '⬇',
  'Strong Downward Momentum': '⬇⬇',
};

function sentimentDot(s?: string) {
  if (s === 'positive') return '🟢';
  if (s === 'negative') return '🔴';
  return '⚪';
}

function scoreBar(score: number) {
  // -1 → 0%, 0 → 50%, +1 → 100%
  const pct = ((score + 1) / 2) * 100;
  return pct;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SentimentPanel({ marketId }: Props) {
  const [data, setData] = useState<SentimentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showArticles, setShowArticles] = useState(false);

  async function fetch() {
    setLoading(true);
    setError('');
    try {
      const res = await getSentimentAnalysis(marketId);
      setData(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId]);

  return (
    <div className="card border-brand-500/30">
      {/* ── Header ─── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2">
          <span className="text-brand-500">📰</span> News Sentiment
        </h2>
        <button
          onClick={fetch}
          disabled={loading}
          className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-40"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Loading / Error ─── */}
      {loading && !data && (
        <div className="text-sm text-gray-500 animate-pulse">
          Fetching real-time news & analysing sentiment…
        </div>
      )}
      {error && !loading && (
        <div className="text-sm text-red-400">{error}</div>
      )}

      {/* ── Data ─── */}
      {data && !loading && (
        <div className="space-y-4">

          {/* Row 1 — Label + Score bar */}
          <div className={`flex items-center gap-3 rounded-xl border p-3 ${labelBg[data.sentiment_label] ?? ''}`}>
            <span className={`text-2xl font-black ${labelStyle[data.sentiment_label]}`}>
              {data.sentiment_label}
            </span>
            <div className="flex-1">
              {/* score bar — red-left, green-right */}
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden relative">
                {/* center marker */}
                <div className="absolute left-1/2 top-0 h-full w-px bg-gray-600" />
                <div
                  className={`h-full rounded-full transition-all ${
                    data.sentiment_score >= 0 ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                  style={{
                    width: `${Math.abs(data.sentiment_score) * 50}%`,
                    marginLeft: data.sentiment_score >= 0 ? '50%' : `${50 - Math.abs(data.sentiment_score) * 50}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
                <span>Bearish</span>
                <span>Neutral</span>
                <span>Bullish</span>
              </div>
            </div>
          </div>

          {/* Row 2 — Stats grid */}
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="bg-gray-800/60 rounded-lg p-2">
              <p className="text-[10px] text-gray-500 mb-0.5">Articles</p>
              <p className="text-lg font-bold text-gray-200">{data.news_articles_analyzed}</p>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-2">
              <p className="text-[10px] text-gray-500 mb-0.5">Confidence</p>
              <p className={`text-lg font-bold ${confidenceStyle[data.confidence]}`}>
                {data.confidence}
              </p>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-2">
              <p className="text-[10px] text-gray-500 mb-0.5">Momentum</p>
              <p className="text-lg font-bold text-gray-200">
                {momentumIcon[data.momentum_indicator] ?? '?'}
              </p>
              <p className="text-[9px] text-gray-500 leading-tight">{data.momentum_indicator}</p>
            </div>
          </div>

          {/* Row 3 — AI vs Market probability */}
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-gray-800/60 rounded-lg p-3">
              <p className="text-[10px] text-gray-500 mb-0.5">AI Adjusted Prob.</p>
              <p className="text-xl font-bold text-brand-500">
                {formatProb(data.ai_probability)}
              </p>
              <p className="text-[10px] text-gray-500">
                {data.ai_probability_adjustment >= 0 ? '+' : ''}
                {(data.ai_probability_adjustment * 100).toFixed(2)}% from sentiment
              </p>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-3">
              <p className="text-[10px] text-gray-500 mb-0.5">Mispricing</p>
              <p
                className={`text-xl font-bold ${
                  data.mispricing_percent > 0
                    ? 'text-emerald-400'
                    : data.mispricing_percent < 0
                    ? 'text-red-400'
                    : 'text-gray-400'
                }`}
              >
                {data.mispricing_percent > 0 ? '+' : ''}
                {data.mispricing_percent.toFixed(1)}%
              </p>
              <p className="text-[10px] text-gray-500">
                {data.mispricing_percent > 2
                  ? 'Under-priced → Buy YES'
                  : data.mispricing_percent < -2
                  ? 'Over-priced → Buy NO'
                  : 'Fairly priced'}
              </p>
            </div>
          </div>

          {/* Row 4 — Explanation */}
          <p className="text-sm text-gray-400 leading-relaxed">{data.explanation}</p>

          {/* Row 5 — Article list (collapsible) */}
          {data.articles.length > 0 && (
            <div>
              <button
                className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-1"
                onClick={() => setShowArticles(!showArticles)}
              >
                {showArticles ? '▾ Hide' : '▸ Show'} {data.articles.length} source articles
              </button>
              {showArticles && (
                <ul className="mt-2 space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {data.articles.map((a: SentimentArticle, i: number) => (
                    <li key={i} className="text-xs flex items-start gap-1.5">
                      <span className="mt-0.5 shrink-0">{sentimentDot(a.sentiment)}</span>
                      <div className="min-w-0">
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-300 hover:text-white line-clamp-2 underline-offset-2 hover:underline"
                        >
                          {a.title}
                        </a>
                        <p className="text-gray-600 text-[10px]">{a.source}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Timestamp */}
          <p className="text-[10px] text-gray-600 text-right">
            Last fetched: {new Date(data.fetched_at).toLocaleString()}
          </p>
        </div>
      )}

      {/* ── Not yet fetched ─── */}
      {!data && !loading && !error && (
        <button onClick={fetch} className="btn-secondary w-full mt-2 text-sm">
          Analyse News Sentiment
        </button>
      )}
    </div>
  );
}
