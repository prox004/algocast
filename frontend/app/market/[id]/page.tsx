'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getMarket,
  claimWinnings,
  resolveMarket,
  getToken,
  formatAlgo,
  formatProb,
  isExpired,
  getMarketCurrentPrice,
  type Market,
  type CurrentPrice,
} from '@/lib/api';
import BuyPanel from '@/components/BuyPanel';
import AIInsightPanel from '@/components/AIInsightPanel';
import SentimentPanel from '@/components/SentimentPanel';
import PriceChart from '@/components/PriceChart';

export default function MarketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [market, setMarket] = useState<Market | null>(null);
  const [currentPrice, setCurrentPrice] = useState<CurrentPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claimMsg, setClaimMsg] = useState('');
  const [resolveMsg, setResolveMsg] = useState('');
  const [buySheet, setBuySheet] = useState<'YES' | 'NO' | null>(null);

  const isLoggedIn = Boolean(getToken());

  function refresh() {
    if (!id) return;
    getMarket(id).then(setMarket).catch(() => {});
  }

  useEffect(() => {
    if (!id) return;
    getMarket(id)
      .then((m) => {
        setMarket(m);
        // Fetch current price if market has a ticker
        if (m.ticker) {
          getMarketCurrentPrice(id)
            .then((res) => setCurrentPrice(res.currentPrice))
            .catch(() => {}); // Silently fail if price fetch fails
        }
      })
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

  function openBuy(side: 'YES' | 'NO') {
    if (!isLoggedIn) { router.push('/login'); return; }
    setBuySheet(side);
  }

  if (loading) return <div className="text-gray-400 p-6">Loading market...</div>;
  if (error) return <div className="text-red-400 p-6">{error}</div>;
  if (!market) return <div className="text-gray-400 p-6">Market not found.</div>;

  const expired = isExpired(market);
  const marketProb = market.market_probability ?? 0;
  const canTrade = isLoggedIn && !market.resolved && !expired;

  return (
    // Extra bottom padding so sticky bar doesn't cover content
    <div className="max-w-2xl mx-auto space-y-4 pb-28">

      {/* Header card */}
      <div className="card">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h1 className="text-lg sm:text-xl font-bold leading-snug">{market.question}</h1>
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

        {/* Tweet Source Info */}
        {market.tweet_author && (
          <div className="mb-4 p-3 bg-blue-950/40 border border-blue-700/30 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Source:</span>
                <a
                  href={`https://x.com/${market.tweet_author}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                >
                  @{market.tweet_author}
                </a>
              </div>
              {market.tweet_id && (
                <a
                  href={`https://x.com/i/web/status/${market.tweet_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline"
                >
                  View Tweet
                </a>
              )}
            </div>
            {market.tweet_content && (
              <p className="text-xs text-gray-400 mt-2 italic line-clamp-3">&ldquo;{market.tweet_content}&rdquo;</p>
            )}
          </div>
        )}

        {/* Ticker & Real-time Price Display */}
        {market.ticker && currentPrice && (
          <div className="mb-4 p-3 bg-gradient-to-r from-cyan-900/20 to-blue-900/20 border border-cyan-700/30 rounded-lg">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-400 mb-1">TICKER</p>
                <p className="text-lg font-bold text-white">{currentPrice.ticker} {market.asset_type && <span className="text-xs text-gray-400 ml-1">({market.asset_type.toUpperCase()})</span>}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-emerald-400">${currentPrice.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                {currentPrice.priceChangePercent24h !== undefined && (
                  <p className={`text-sm font-semibold ${currentPrice.priceChangePercent24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {currentPrice.priceChangePercent24h >= 0 ? '+' : ''}{currentPrice.priceChangePercent24h.toFixed(2)}% (24h)
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Big YES / NO probability display */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 bg-emerald-950/60 border border-emerald-800/50 rounded-xl p-3 text-center">
            <p className="text-xs text-emerald-400/70 font-medium mb-0.5">YES</p>
            <p className="text-2xl font-black text-emerald-400">{formatProb(marketProb)}</p>
          </div>
          <div className="flex-1 bg-red-950/60 border border-red-800/50 rounded-xl p-3 text-center">
            <p className="text-xs text-red-400/70 font-medium mb-0.5">NO</p>
            <p className="text-2xl font-black text-red-400">{formatProb(1 - marketProb)}</p>
          </div>
        </div>

        {/* Probability bar */}
        <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${marketProb * 100}%` }}
          />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-gray-800/60 rounded-lg px-3 py-2">
            <span className="block text-xs text-gray-500 mb-0.5">YES Reserve</span>
            <span className="text-gray-200 font-medium">{formatAlgo(market.yes_reserve)}</span>
          </div>
          <div className="bg-gray-800/60 rounded-lg px-3 py-2">
            <span className="block text-xs text-gray-500 mb-0.5">NO Reserve</span>
            <span className="text-gray-200 font-medium">{formatAlgo(market.no_reserve)}</span>
          </div>
          <div className="bg-gray-800/60 rounded-lg px-3 py-2">
            <span className="block text-xs text-gray-500 mb-0.5">AI Probability</span>
            <span className="text-gray-200 font-medium">{formatProb(market.ai_probability)}</span>
          </div>
          <div className="bg-gray-800/60 rounded-lg px-3 py-2">
            <span className="block text-xs text-gray-500 mb-0.5">Expires</span>
            <span className="text-gray-200 font-medium text-xs">{new Date(market.expiry * 1000).toLocaleDateString()}</span>
          </div>
          {market.resolved && (
            <div className="bg-gray-800/60 rounded-lg px-3 py-2 col-span-2">
              <span className="block text-xs text-gray-500 mb-0.5">Outcome</span>
              <span className={market.outcome === 1 ? 'text-emerald-400 font-bold text-lg' : 'text-red-400 font-bold text-lg'}>
                {market.outcome === 1 ? '✓ YES' : '✗ NO'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* AI Insight */}
      <AIInsightPanel marketId={market.id} />

      {/* News Sentiment Analysis */}
      <SentimentPanel marketId={market.id} />

      {/* Price Chart - Show if ticker exists */}
      {market.ticker && (
        <PriceChart marketId={market.id} ticker={market.ticker} assetType={market.asset_type} />
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

      {/* Resolve */}
      {isLoggedIn && !market.resolved && (
        <div className="card">
          <h2 className="font-semibold mb-3 text-yellow-400 text-sm">Resolve Market</h2>
          <div className="flex gap-3">
            <button onClick={() => handleResolve(1)} className="btn-primary flex-1 text-sm">
              Resolve YES
            </button>
            <button onClick={() => handleResolve(0)} className="btn-secondary flex-1 text-sm">
              Resolve NO
            </button>
          </div>
          {resolveMsg && <p className="text-sm mt-2 text-gray-300">{resolveMsg}</p>}
        </div>
      )}

      {/* ── Sticky bottom buy bar ── */}
      {canTrade && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-gray-950/95 backdrop-blur border-t border-gray-800 safe-bottom">
          <div className="max-w-2xl mx-auto px-4 py-3 flex gap-3">
            <button
              onClick={() => openBuy('YES')}
              className="flex-1 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-base transition-colors"
            >
              Buy YES
            </button>
            <button
              onClick={() => openBuy('NO')}
              className="flex-1 py-4 rounded-xl bg-red-700 hover:bg-red-600 active:bg-red-800 text-white font-bold text-base transition-colors"
            >
              Buy NO
            </button>
          </div>
        </div>
      )}

      {/* Buy bottom sheet */}
      {buySheet && market && (
        <BuyPanel
          market={market}
          defaultSide={buySheet}
          onTrade={() => { refresh(); setBuySheet(null); }}
          onClose={() => setBuySheet(null)}
        />
      )}
    </div>
  );
}
