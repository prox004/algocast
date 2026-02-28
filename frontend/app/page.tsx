'use client';

import { useEffect, useState } from 'react';
import { getMarkets, type Market } from '@/lib/api';
import MarketCard from '@/components/MarketCard';

export default function HomePage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getMarkets()
      .then(setMarkets)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Prediction Markets</h1>
        <p className="text-gray-400">AI-powered YES/NO markets on Algorand TestNet</p>
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

      {!loading && markets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map((m) => (
            <MarketCard key={m.id} market={m} />
          ))}
        </div>
      )}
    </div>
  );
}
