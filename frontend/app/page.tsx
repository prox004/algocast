'use client';

import { useEffect, useState } from 'react';
import { getMarkets, type Market } from '@/lib/api';
import MarketCard from '@/components/MarketCard';
import SwipeView from '@/components/SwipeView';

export default function HomePage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [swipeMode, setSwipeMode] = useState(false);

  useEffect(() => {
    getMarkets()
      .then(setMarkets)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Header row */}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">Prediction Markets</h1>
          <p className="text-gray-400 text-sm">AI-powered YES/NO markets on Algorand TestNet</p>
        </div>

        {/* Swipe mode toggle — mobile only */}
        {!loading && markets.length > 0 && (
          <button
            onClick={() => setSwipeMode((s) => !s)}
            className="md:hidden shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors"
            style={
              swipeMode
                ? { background: '#4f6ef7', borderColor: '#4f6ef7', color: '#fff' }
                : { borderColor: '#374151', color: '#9ca3af' }
            }
          >
            {swipeMode ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                List
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                Swipe
              </>
            )}
          </button>
        )}
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card animate-pulse h-44 bg-gray-800" />
          ))}
        </div>
      )}

      {error && (
        <div className="card border-red-800 text-red-400 text-sm">
          Failed to load markets: {error}
        </div>
      )}

      {!loading && !error && markets.length === 0 && (
        <div className="card text-center text-gray-500 py-16">
          <p className="text-lg mb-2">No markets yet.</p>
          <p className="text-sm">Log in and create the first market!</p>
        </div>
      )}

      {/* Swipe mode — mobile only, when toggled */}
      {!loading && markets.length > 0 && swipeMode && (
        <div className="md:hidden">
          <SwipeView markets={markets} />
        </div>
      )}

      {/* Grid — mobile (when not in swipe mode) */}
      {!loading && markets.length > 0 && !swipeMode && (
        <div className="md:hidden grid grid-cols-1 gap-4">
          {markets.map((m) => (
            <MarketCard key={m.id} market={m} />
          ))}
        </div>
      )}

      {/* Grid — desktop always */}
      {!loading && markets.length > 0 && (
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map((m) => (
            <MarketCard key={m.id} market={m} />
          ))}
        </div>
      )}
    </div>
  );
}
