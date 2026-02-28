'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buyYes, buyNo, getToken, formatProb, formatAlgo, type Market } from '@/lib/api';

const SWIPE_THRESHOLD = 75;
const PRESETS = [0.1, 0.5, 1, 5];

interface Props {
  markets: Market[];
}

export default function SwipeView({ markets }: Props) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingSide, setPendingSide] = useState<'YES' | 'NO' | null>(null);
  const [amount, setAmount] = useState(0.1);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const startX = useRef(0);

  const active = markets.filter((m) => !m.resolved && !done.has(m.id));
  const market = active[0] ?? null;

  if (!market) {
    return (
      <div className="flex flex-col items-center justify-center h-[65vh] text-center px-8">
        <div className="text-6xl mb-4">🎉</div>
        <p className="text-xl font-bold mb-2">All caught up!</p>
        <p className="text-gray-400 text-sm">No more open markets to swipe on.</p>
      </div>
    );
  }

  const direction = dragX > SWIPE_THRESHOLD ? 'YES' : dragX < -SWIPE_THRESHOLD ? 'NO' : null;
  const overlayOpacity = Math.min(Math.abs(dragX) / (SWIPE_THRESHOLD * 1.5), 1);
  const rotation = dragX * 0.07;
  const prob = market.market_probability ?? 0.5;

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    setIsDragging(true);
    setMsg('');
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!isDragging) return;
    setDragX(e.touches[0].clientX - startX.current);
  }

  function onTouchEnd() {
    setIsDragging(false);
    if (Math.abs(dragX) >= SWIPE_THRESHOLD) {
      if (!getToken()) {
        setDragX(0);
        router.push('/login');
        return;
      }
      setPendingSide(dragX > 0 ? 'YES' : 'NO');
    }
    setDragX(0);
  }

  function skipCard() {
    setDone((prev) => new Set(prev).add(market.id));
    setMsg('');
  }

  async function confirmTrade() {
    if (!pendingSide || !market) return;
    if (amount <= 0) return setMsg('Enter a valid amount');
    setLoading(true);
    setMsg('');
    try {
      const micro = Math.floor(amount * 1_000_000);
      const fn = pendingSide === 'YES' ? buyYes : buyNo;
      const res = await fn(market.id, micro);
      setMsg(`Bought ${res.tokens.toLocaleString()} ${pendingSide} tokens!`);
      setTimeout(() => {
        setDone((prev) => new Set(prev).add(market.id));
        setPendingSide(null);
        setMsg('');
      }, 1000);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex flex-col items-center select-none" style={{ height: 'calc(100dvh - 130px)' }}>
      {/* Counter */}
      <div className="w-full flex justify-end items-center mb-2 px-1 text-xs text-gray-600">
        {active.length} market{active.length !== 1 ? 's' : ''} left
      </div>

      {/* Background card (next item peek) */}
      {active[1] && (
        <div className="absolute inset-x-0 top-8 bottom-8 bg-gray-900 border border-gray-800 rounded-2xl scale-95 opacity-60" />
      )}

      {/* Swipe card */}
      <div
        className="absolute inset-x-0 top-0 bottom-8 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden touch-none"
        style={{
          transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
          transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(.25,.8,.25,1)',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* YES overlay */}
        {dragX > 0 && (
          <div
            className="absolute inset-0 bg-emerald-500/15 flex items-center justify-start pl-6 z-10 pointer-events-none"
            style={{ opacity: overlayOpacity }}
          >
            <span className="border-4 border-emerald-400 text-emerald-400 text-3xl font-black px-3 py-1 rounded-xl -rotate-12">
              YES
            </span>
          </div>
        )}
        {/* NO overlay */}
        {dragX < 0 && (
          <div
            className="absolute inset-0 bg-red-500/15 flex items-center justify-end pr-6 z-10 pointer-events-none"
            style={{ opacity: overlayOpacity }}
          >
            <span className="border-4 border-red-400 text-red-400 text-3xl font-black px-3 py-1 rounded-xl rotate-12">
              NO
            </span>
          </div>
        )}

        <div className="flex flex-col h-full p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs bg-emerald-900/60 text-emerald-300 px-2 py-0.5 rounded font-semibold">
              LIVE
            </span>
            <span className="text-xs text-gray-500">
              Expires {new Date(market.expiry * 1000).toLocaleDateString()}
            </span>
          </div>

          {/* Question */}
          <p className="text-xl font-bold leading-snug flex-1 flex items-center">
            {market.question}
          </p>

          {/* Prob bar */}
          <div className="mb-5">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-emerald-400 font-semibold">YES {formatProb(prob)}</span>
              <span className="text-red-400 font-semibold">NO {formatProb(1 - prob)}</span>
            </div>
            <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${prob * 100}%` }} />
            </div>
          </div>

          {/* Stats */}
          <div className="flex justify-between text-xs text-gray-500 mb-5 bg-gray-800/50 rounded-lg px-3 py-2">
            <span>Pool: {formatAlgo(market.yes_reserve + market.no_reserve)}</span>
            {market.ai_probability > 0 && (
              <span>AI: {formatProb(market.ai_probability)}</span>
            )}
          </div>

          {/* Swipe hint */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-red-500/60 font-semibold">← NO</span>
            <button onClick={skipCard} className="text-xs text-gray-700 underline underline-offset-2">
              skip
            </button>
            <span className="text-emerald-500/60 font-semibold">YES →</span>
          </div>
        </div>
      </div>

      {/* Amount confirmation bottom sheet */}
      {pendingSide && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-end"
          onClick={() => !loading && setPendingSide(null)}
        >
          <div
            className="w-full bg-gray-900 border-t border-gray-800 rounded-t-2xl p-5 pb-8 safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5" />

            <p className="font-bold text-lg text-center mb-1">
              Buy{' '}
              <span className={pendingSide === 'YES' ? 'text-emerald-400' : 'text-red-400'}>
                {pendingSide}
              </span>
            </p>
            <p className="text-xs text-gray-500 text-center mb-5 px-4 leading-relaxed">
              {market.question}
            </p>

            {/* Preset amounts */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setAmount(p)}
                  className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    amount === p
                      ? pendingSide === 'YES'
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-red-700 border-red-700 text-white'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {p}A
                </button>
              ))}
            </div>

            {/* Custom input */}
            <input
              type="number"
              className="input mb-4"
              placeholder="Custom amount in ALGO"
              min="0"
              step="0.1"
              value={amount || ''}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            />

            {msg && (
              <p
                className={`text-sm mb-3 text-center ${
                  msg.startsWith('Bought') ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {msg}
              </p>
            )}

            <button
              onClick={confirmTrade}
              disabled={loading || amount <= 0}
              className={`w-full py-3.5 rounded-xl font-bold text-base transition-colors disabled:opacity-50 ${
                pendingSide === 'YES'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-red-700 hover:bg-red-600'
              }`}
            >
              {loading ? '…' : `Confirm ${pendingSide} — ${amount} ALGO`}
            </button>

            <button
              onClick={() => setPendingSide(null)}
              className="w-full py-2.5 mt-2 text-gray-500 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
