'use client';

import { useEffect, useState, useMemo } from 'react';
import { getMarkets, type Market } from '@/lib/api';
import MarketCard from '@/components/MarketCard';
import SwipeView from '@/components/SwipeView';
import CategoryTabs, { type CategoryKey } from '@/components/CategoryTabs';

export default function HomePage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [swipeMode, setSwipeMode] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');

  useEffect(() => {
    getMarkets()
      .then(setMarkets)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Compute category counts from all markets
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const now = Date.now() / 1000;
    for (const m of markets) {
      const cat = m.category || 'general';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    counts['all'] = markets.length;
    counts['open'] = markets.filter(
      (m) => !m.resolved && m.expiry > now
    ).length;
    counts['expired'] = markets.filter(
      (m) => !m.resolved && m.expiry <= now
    ).length;
    counts['resolved'] = markets.filter((m) => m.resolved).length;
    counts['trending'] = markets
      .filter((m) => (m.yes_reserve + m.no_reserve) > 0)
      .length;
    counts['new'] = markets
      .filter((m) => {
        const age = Date.now() / 1000 - (m.expiry - 48 * 3600); // rough creation estimate
        return m.expiry * 1000 > Date.now() && age < 24 * 3600;
      })
      .length;
    return counts;
  }, [markets]);

  // Filter markets based on selected category
  const filteredMarkets = useMemo(() => {
    const now = Date.now() / 1000;
    if (activeCategory === 'all') return markets;
    if (activeCategory === 'open') {
      return markets.filter((m) => !m.resolved && m.expiry > now);
    }
    if (activeCategory === 'expired') {
      return markets.filter((m) => !m.resolved && m.expiry <= now);
    }
    if (activeCategory === 'resolved') {
      return markets.filter((m) => m.resolved);
    }
    if (activeCategory === 'trending') {
      return [...markets]
        .filter((m) => (m.yes_reserve + m.no_reserve) > 0)
        .sort((a, b) => (b.yes_reserve + b.no_reserve) - (a.yes_reserve + a.no_reserve));
    }
    if (activeCategory === 'new') {
      return [...markets]
        .filter((m) => m.expiry * 1000 > Date.now())
        .sort((a, b) => b.expiry - a.expiry);
    }
    return markets.filter((m) => (m.category || 'general') === activeCategory);
  }, [markets, activeCategory]);

  return (
    <div>
      {/* Header row */}
      <div className="mb-4 flex items-end justify-between gap-4">
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

      {/* Category filter tabs */}
      {!loading && markets.length > 0 && (
        <CategoryTabs
          active={activeCategory}
          onChange={setActiveCategory}
          counts={categoryCounts}
        />
      )}

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

      {/* No markets in this category */}
      {!loading && !error && markets.length > 0 && filteredMarkets.length === 0 && (
        <div className="card text-center text-gray-500 py-12">
          <p className="text-base mb-1">No markets in this category yet.</p>
          <p className="text-sm">Try a different tab or check back later!</p>
        </div>
      )}

      {/* Swipe mode — mobile only, when toggled */}
      {!loading && filteredMarkets.length > 0 && swipeMode && (
        <div className="md:hidden">
          <SwipeView markets={filteredMarkets} />
        </div>
      )}

      {/* Grid — mobile (when not in swipe mode) */}
      {!loading && filteredMarkets.length > 0 && !swipeMode && (
        <div className="md:hidden grid grid-cols-1 gap-4">
          {filteredMarkets.map((m) => (
            <MarketCard key={m.id} market={m} />
          ))}
        </div>
      )}

      {/* Grid — desktop always */}
      {!loading && filteredMarkets.length > 0 && (
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMarkets.map((m) => (
            <MarketCard key={m.id} market={m} />
          ))}
        </div>
      )}
    </div>
  );
}
