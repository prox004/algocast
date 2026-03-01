'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getMarket,
  claimWinnings,
  getUserTradesForMarket,
  getToken,
  formatAlgo,
  formatProb,
  isExpired,
  getMarketCurrentPrice,
  type Market,
  type Trade,
  type CurrentPrice,
} from '@/lib/api';
import BuyPanel from '@/components/BuyPanel';
import AIInsightPanel from '@/components/AIInsightPanel';
import SentimentPanel from '@/components/SentimentPanel';
import PriceChart from '@/components/PriceChart';
import OrderBook from '@/components/OrderBook';
import UmaDisputePanel from '@/components/UmaDisputePanel';

export default function MarketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [market, setMarket] = useState<Market | null>(null);
  const [currentPrice, setCurrentPrice] = useState<CurrentPrice | null>(null);
  const [userTrades, setUserTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claimMsg, setClaimMsg] = useState('');
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

  // Fetch user's trades for this market (needed for claim eligibility + dispute gating)
  useEffect(() => {
    if (!id || !isLoggedIn) return;
    getUserTradesForMarket(id).then(setUserTrades).catch(() => {});
  }, [id, isLoggedIn]);

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

  // Normalise outcome: integer column takes priority; fall back to TEXT result column
  const effectiveOutcome: 0 | 1 | null =
    market.outcome !== null ? market.outcome
    : market.result === 'yes' ? 1
    : market.result === 'no'  ? 0
    : null;

  // UMA is blocking claims if a dispute/vote is still in progress
  const umaInProgress = market.uma_status === 'PROPOSED' || market.uma_status === 'UMA_VOTING';

  // Only show claim if the user actually bet on the winning side
  const hasWinningPosition =
    effectiveOutcome !== null &&
    userTrades.some((t) => t.side === (effectiveOutcome === 1 ? 'YES' : 'NO'));

  const canClaim = isLoggedIn && market.resolved && !umaInProgress && hasWinningPosition;

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

      {/* Potential Payout Calculator */}
      {!market.resolved && !expired && (() => {
        const yesPrice = Math.max(marketProb, 0.01);
        const noPrice = Math.max(1 - marketProb, 0.01);
        const yesMultiplier = 1 / yesPrice;
        const noMultiplier = 1 / noPrice;
        const yesProfit = yesMultiplier - 1;
        const noProfit = noMultiplier - 1;
        return (
          <div className="card">
            <h2 className="font-semibold mb-3 text-sm">Share Prices & Potential Payouts</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-950/40 border border-emerald-800/30 rounded-xl p-3 text-center">
                <p className="text-xs text-emerald-400/70 mb-1">YES share</p>
                <p className="text-2xl font-bold text-emerald-400">
                  {(yesPrice * 100).toFixed(1)}¢
                </p>
                <p className="text-xs text-emerald-400/60 mt-1">
                  Pays <span className="font-bold">1.00 ALGO</span> if YES wins
                </p>
                <div className="mt-2 pt-2 border-t border-emerald-800/30">
                  <p className="text-[10px] text-gray-400">Per 1 ALGO invested</p>
                  <p className="text-sm font-bold text-emerald-400">{yesMultiplier.toFixed(2)}x</p>
                  <p className="text-[10px] text-emerald-500/50">+{yesProfit.toFixed(2)} ALGO profit</p>
                </div>
              </div>
              <div className="bg-red-950/40 border border-red-800/30 rounded-xl p-3 text-center">
                <p className="text-xs text-red-400/70 mb-1">NO share</p>
                <p className="text-2xl font-bold text-red-400">
                  {(noPrice * 100).toFixed(1)}¢
                </p>
                <p className="text-xs text-red-400/60 mt-1">
                  Pays <span className="font-bold">1.00 ALGO</span> if NO wins
                </p>
                <div className="mt-2 pt-2 border-t border-red-800/30">
                  <p className="text-[10px] text-gray-400">Per 1 ALGO invested</p>
                  <p className="text-sm font-bold text-red-400">{noMultiplier.toFixed(2)}x</p>
                  <p className="text-[10px] text-red-500/50">+{noProfit.toFixed(2)} ALGO profit</p>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-gray-600 text-center mt-2">
              Lower share price = higher odds = bigger payout. All payouts are on-chain.
            </p>
          </div>
        );
      })()}

      {/* News Sentiment Analysis */}
      <SentimentPanel marketId={market.id} />

      {/* Price Chart - Show if ticker exists */}
      {market.ticker && (
        <PriceChart marketId={market.id} ticker={market.ticker} assetType={market.asset_type} />
      )}

      {/* Claim */}
      {canClaim && (
        <div className="card">
          <h2 className="font-semibold mb-2">Claim Winnings</h2>
          <p className="text-xs text-gray-400 mb-3">
            You bet{' '}
            <span className={effectiveOutcome === 1 ? 'font-bold text-emerald-400' : 'font-bold text-red-400'}>
              {effectiveOutcome === 1 ? 'YES' : 'NO'}
            </span>{' '}
            and this market resolved{' '}
            <span className={effectiveOutcome === 1 ? 'font-bold text-emerald-400' : 'font-bold text-red-400'}>
              {effectiveOutcome === 1 ? 'YES' : 'NO'}
            </span>. Claim your payout below.
          </p>
          <button onClick={handleClaim} className="btn-primary w-full">
            Claim Winnings
          </button>
          {claimMsg && <p className="text-sm mt-2 text-gray-300">{claimMsg}</p>}
        </div>
      )}

      {/* Losing position notice */}
      {isLoggedIn && market.resolved && !umaInProgress && !hasWinningPosition && effectiveOutcome !== null && userTrades.length > 0 && (
        <div className="card">
          <p className="text-sm text-gray-400 text-center">
            Market resolved{' '}
            <span className={effectiveOutcome === 1 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
              {effectiveOutcome === 1 ? 'YES' : 'NO'}
            </span>. Your position did not win.
          </p>
        </div>
      )}

      {/* UMA dispute in progress — claim blocked */}
      {isLoggedIn && umaInProgress && (
        <div className="card text-center">
          <p className="text-sm text-blue-300">⚖️ UMA dispute in progress — claim will be available once the verdict is locked.</p>
        </div>
      )}

      {/* UMA Dispute Resolution */}
      <UmaDisputePanel marketId={market.id} />

      {/* Order Book */}
      <OrderBook
        marketId={market.id}
        resolved={market.resolved}
        expired={expired}
        isLoggedIn={isLoggedIn}
      />

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
