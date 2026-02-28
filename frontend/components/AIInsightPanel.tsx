'use client';

import { useEffect, useState } from 'react';
import { getAIAnalysis, formatProb, type AIAnalysis } from '@/lib/api';

interface Props {
  marketId: string;
}

const sentimentStyle: Record<string, string> = {
  BULLISH: 'text-emerald-400',
  BEARISH: 'text-red-400',
  NEUTRAL: 'text-yellow-400',
};

export default function AIInsightPanel({ marketId }: Props) {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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

  useEffect(() => {
    fetchAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId]);

  return (
    <div className="card border-brand-500/30">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2">
          <span className="text-brand-500">✦</span> AI Analysis
        </h2>
        <button onClick={fetchAnalysis} className="text-xs text-gray-500 hover:text-gray-300">
          Refresh
        </button>
      </div>

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
