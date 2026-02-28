'use client';

import { useEffect, useState } from 'react';
import { getAIAnalysis, getSentiment, formatProb, type AIAnalysis } from '@/lib/api';

interface Props {
  marketId: string;
}

interface SentimentData {
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
  summary: string;
}

const sentimentStyle: Record<string, string> = {
  BULLISH: 'text-emerald-400',
  BEARISH: 'text-red-400',
  NEUTRAL: 'text-yellow-400',
};

const momentumStyle: Record<string, string> = {
  RISING: 'text-emerald-400',
  FALLING: 'text-red-400',
  STABLE: 'text-gray-400',
};

const recommendationStyle: Record<string, string> = {
  'BUY YES': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'BUY NO': 'bg-red-500/20 text-red-400 border-red-500/30',
  'HOLD': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
};

export default function AIInsightPanel({ marketId }: Props) {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentimentLoading, setSentimentLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentimentError, setSentimentError] = useState('');
  const [fetched, setFetched] = useState(false);

  async function fetchAnalysis() {
    setLoading(true);
    setError('');
    try {
      const res = await getAIAnalysis(marketId);
      setAnalysis(res);
      setFetched(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSentiment() {
    setSentimentLoading(true);
    setSentimentError('');
    try {
      const res = await getSentiment(marketId);
      setSentiment(res);
    } catch (e: any) {
      setSentimentError(e.message);
    } finally {
      setSentimentLoading(false);
    }
  }

  useEffect(() => {
    fetchAnalysis();
    fetchSentiment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId]);

  return (
    <div className="card border-brand-500/30">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold flex items-center gap-2">
          <span className="text-brand-500">✦</span> AI Analysis & Sentiment
        </h2>
        <button 
          onClick={() => { fetchAnalysis(); fetchSentiment(); }} 
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Sentiment Analyzer Section */}
      {sentiment && !sentimentLoading && (
        <div className="mb-4 p-4 bg-gradient-to-br from-brand-500/10 to-purple-500/10 rounded-lg border border-brand-500/20">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-brand-400">Live Sentiment</h3>
            <span className={`text-xs px-2 py-1 rounded-full ${momentumStyle[sentiment.sentiment.momentum]}`}>
              {sentiment.sentiment.momentum}
            </span>
          </div>

          {/* Sentiment Score */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Sentiment</p>
              <p className={`text-xl font-bold ${sentimentStyle[sentiment.sentiment.label]}`}>
                {sentiment.sentiment.label}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {(sentiment.sentiment.confidence * 100).toFixed(0)}% confidence
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">AI vs Crowd</p>
              <p className="text-xl font-bold text-brand-400">
                {sentiment.analysis.divergence}%
              </p>
              <p className="text-xs text-gray-600 mt-1">divergence</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Recommendation</p>
              <p className={`text-xs font-bold px-2 py-1 rounded border ${recommendationStyle[sentiment.analysis.recommendation]}`}>
                {sentiment.analysis.recommendation}
              </p>
            </div>
          </div>

          {/* AI vs Crowd Comparison */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-gray-900/50 rounded p-2">
              <p className="text-xs text-gray-500">AI Probability</p>
              <p className="text-lg font-bold text-brand-400">
                {formatProb(sentiment.analysis.ai_probability)}
              </p>
            </div>
            <div className="bg-gray-900/50 rounded p-2">
              <p className="text-xs text-gray-500">Market Price</p>
              <p className="text-lg font-bold text-gray-300">
                {formatProb(sentiment.analysis.crowd_probability)}
              </p>
            </div>
          </div>

          {/* Data Sources */}
          <div className="flex items-center justify-between text-xs text-gray-600 border-t border-gray-800 pt-2">
            <span>📰 {sentiment.sources.news_count} articles</span>
            <span>💬 {sentiment.sources.social_mentions} mentions</span>
            <span>📊 {(sentiment.sources.trend_volume / 1000).toFixed(0)}k volume</span>
          </div>

          {/* Summary */}
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            {sentiment.summary}
          </p>
        </div>
      )}

      {sentimentLoading && (
        <div className="mb-4 p-4 bg-gray-800/30 rounded-lg animate-pulse">
          <div className="text-sm text-gray-500">Analyzing sentiment...</div>
        </div>
      )}

      {sentimentError && !sentimentLoading && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-xs text-red-400">{sentimentError}</p>
        </div>
      )}

      {/* Original AI Analysis Section */}
      {loading && (
        <div className="text-sm text-gray-500 animate-pulse">Analyzing market…</div>
      )}

      {error && !loading && (
        <div className="text-sm text-red-400">{error}</div>
      )}

      {analysis && !loading && (
        <div className="space-y-3">
          {/* Probability comparison */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800/60 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">AI Probability</p>
              <p className="text-2xl font-bold text-brand-500">
                {formatProb(analysis.ai_probability)}
              </p>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Sentiment</p>
              <p className={`text-xl font-bold ${sentimentStyle[analysis.sentiment] ?? 'text-white'}`}>
                {analysis.sentiment}
              </p>
            </div>
          </div>

          {/* Summary */}
          <p className="text-sm text-gray-400 leading-relaxed">{analysis.summary}</p>
        </div>
      )}

      {!fetched && !loading && !error && (
        <button onClick={fetchAnalysis} className="btn-secondary w-full mt-2 text-sm">
          Get AI Analysis
        </button>
      )}
    </div>
  );
}
