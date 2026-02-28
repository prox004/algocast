'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  getMarket,
  claimWinnings,
  resolveMarket,
  getToken,
  formatAlgo,
  formatProb,
  isExpired,
  type Market,
} from '@/lib/api';
import BuyPanel from '@/components/BuyPanel';
import AIInsightPanel from '@/components/AIInsightPanel';

export default function MarketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claimMsg, setClaimMsg] = useState('');
  const [resolveMsg, setResolveMsg] = useState('');

  const isLoggedIn = Boolean(getToken());

  function refresh() {
    if (!id) return;
    getMarket(id).then(setMarket).catch(() => {});
  }

  useEffect(() => {
    if (!id) return;
    getMarket(id)
      .then(setMarket)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleClaim() {
    if (!market) return;
    try {
      const res = await claimWinnings(market.id);
      setClaimMsg(`Claimed ${formatAlgo(res.payout)}!`);
      refresh();
    } catch (e: any) {
      setClaimMsg(e.message);
    }
  }

  async function handleResolve(outcome: 0 | 1) {
    if (!market) return;
    try {
      await resolveMarket(market.id, outcome);
      setResolveMsg('Market resolved!');
      refresh();
    } catch (e: any) {
      setResolveMsg(e.message);
    }
  }

  if (loading) return <div className="text-gray-400">Loading market…</div>;
  if (error) return <div className="text-red-400">{error}</div>;
  if (!market) return <div className="text-gray-400">Market not found.</div>;

  const expired = isExpired(market);
  const marketProb = market.market_probability ?? 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h1 className="text-xl font-bold leading-snug">{market.question}</h1>
          <span
            className={`shrink-0 text-xs font-semibold px-2 py-1 rounded ${
              market.resolved
                ? 'bg-purple-900/60 text-purple-300'
                : expired
                ? 'bg-yellow-900/60 text-yellow-300'
                : 'bg-emerald-900/60 text-emerald-300'
            }`}
          >
            {market.resolved ? 'RESOLVED' : expired ? 'EXPIRED' : 'LIVE'}
          </span>
        </div>

        {/* Probability bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-400 mb-1">
            <span>YES — {formatProb(marketProb)}</span>
            <span>NO — {formatProb(1 - marketProb)}</span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${marketProb * 100}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm text-gray-400">
          <div>
            <span className="block text-xs text-gray-600">YES Reserve</span>
            {formatAlgo(market.yes_reserve)}
          </div>
          <div>
            <span className="block text-xs text-gray-600">NO Reserve</span>
            {formatAlgo(market.no_reserve)}
          </div>
          <div>
            <span className="block text-xs text-gray-600">Expires</span>
            {new Date(market.expiry * 1000).toLocaleString()}
          </div>
          {market.resolved && (
            <div>
              <span className="block text-xs text-gray-600">Outcome</span>
              <span className={market.outcome === 1 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                {market.outcome === 1 ? 'YES' : 'NO'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* AI Insight */}
      <AIInsightPanel marketId={market.id} />

      {/* Buy Panel */}
      {isLoggedIn && !market.resolved && !expired && (
        <BuyPanel market={market} onTrade={refresh} />
      )}

      {/* Claim */}
      {isLoggedIn && market.resolved && (
        <div className="card">
          <h2 className="font-semibold mb-3">Claim Winnings</h2>
          <button onClick={handleClaim} className="btn-primary w-full">
            Claim
          </button>
          {claimMsg && <p className="text-sm mt-2 text-gray-300">{claimMsg}</p>}
        </div>
      )}

      {/* Resolve (hackathon: open to all logged-in users) */}
      {isLoggedIn && !market.resolved && (
        <div className="card">
          <h2 className="font-semibold mb-3 text-yellow-400">Resolve Market</h2>
          <div className="flex gap-3">
            <button onClick={() => handleResolve(1)} className="btn-primary flex-1">
              Resolve YES
            </button>
            <button onClick={() => handleResolve(0)} className="btn-secondary flex-1">
              Resolve NO
            </button>
          </div>
          {resolveMsg && <p className="text-sm mt-2 text-gray-300">{resolveMsg}</p>}
        </div>
      )}
    </div>
  );
}
