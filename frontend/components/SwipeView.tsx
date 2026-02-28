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
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingSide, setPendingSide] = useState<'YES' | 'NO' | null>(null);
  const [amount, setAmount] = useState(0.1);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const startX = useRef(0);
  const startY = useRef(0);

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
    startY.current = e.touches[0].clientY;
    setIsDragging(true);
    setMsg('');
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!isDragging) return;
    setDragX(e.touches[0].clientX - startX.current);
    setDragY(e.touches[0].clientY - startY.current);
  }

  function onTouchEnd() {
    setIsDragging(false);
    
    if (!getToken()) {
      setDragX(0);
      router.push('/login');
      return;
    }

    if (Math.abs(dragX) >= SWIPE_THRESHOLD) {
      if (dragX > 0) {
        // Right swipe → open buy sheet, no side pre-selected
        setSheetOpen(true);
        setPendingSide(null);
        setAmount(0.1);
        setMsg('');
      } else {
        // Left swipe → skip to next market
        skipCard();
      }
    }
    setDragX(0);
    setDragY(0);
  }

  function skipCard() {
    setDone((prev) => new Set(prev).add(market.id));
    setMsg('');
  }

  function closeSheet() {
    if (loading) return;
    setSheetOpen(false);
    setPendingSide(null);
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
        setSheetOpen(false);
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
          transform: `translateX(${dragX}px) translateY(${dragY}px) rotate(${rotation}deg)`,
          transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(.25,.8,.25,1)',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* BUY overlay (right swipe) */}
        {dragX > 0 && (
          <div
            className="absolute inset-0 bg-emerald-500/15 flex items-center justify-start pl-6 z-10 pointer-events-none"
            style={{ opacity: overlayOpacity }}
          >
            <span className="border-4 border-emerald-400 text-emerald-400 text-3xl font-black px-3 py-1 rounded-xl -rotate-12">
              BUY
            </span>
          </div>
        )}
        {/* SKIP overlay (left swipe) */}
        {dragX < 0 && (
          <div
            className="absolute inset-0 bg-gray-600/15 flex items-center justify-end pr-6 z-10 pointer-events-none"
            style={{ opacity: overlayOpacity }}
          >
            <span className="border-4 border-gray-400 text-gray-400 text-3xl font-black px-3 py-1 rounded-xl rotate-12">
              SKIP
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
            <span className="text-gray-500/80 font-semibold">← Skip</span>
            <button onClick={skipCard} className="text-xs text-gray-700 underline underline-offset-2">
              skip
            </button>
            <span className="text-emerald-500/80 font-semibold">Buy →</span>
          </div>
        </div>
      </div>

      {/* Buy modal */}
      {sheetOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeSheet}
        >
          <div
            className="relative w-full bg-gray-950 sm:max-w-sm rounded-t-3xl sm:rounded-3xl border-t sm:border border-gray-800 my-0 sm:my-auto"
            style={{ maxHeight: '90dvh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile drag handle */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-12 h-1.5 bg-gray-800 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 pt-2 sm:pt-5 pb-4 border-b border-gray-800">
              <p className="text-base font-semibold text-gray-300 text-center line-clamp-3 leading-snug px-2">
                {market.question}
              </p>
            </div>

            <div className="px-5 py-5 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(90dvh - 120px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 20px)' }}>
              {/* YES / NO toggle */}
              <div className="flex rounded-2xl overflow-hidden border border-gray-800">
                <button
                  onClick={() => setPendingSide('YES')}
                  className={`flex-1 py-3.5 text-base font-bold transition-colors ${
                    pendingSide === 'YES'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-900 text-gray-500'
                  }`}
                >
                  ✓ YES &nbsp;{formatProb(prob)}
                </button>
                <button
                  onClick={() => setPendingSide('NO')}
                  className={`flex-1 py-3.5 text-base font-bold transition-colors ${
                    pendingSide === 'NO'
                      ? 'bg-red-700 text-white'
                      : 'bg-gray-900 text-gray-500'
                  }`}
                >
                  ✗ NO &nbsp;{formatProb(1 - prob)}
                </button>
              </div>

              {/* Preset amounts */}
              <div>
                <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Amount (ALGO)</p>
                <div className="grid grid-cols-4 gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setAmount(p)}
                      className={`py-2.5 rounded-xl text-sm font-bold border transition-colors active:scale-95 ${
                        amount === p
                          ? pendingSide === 'YES'
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : pendingSide === 'NO'
                            ? 'bg-red-700 border-red-700 text-white'
                            : 'bg-gray-700 border-gray-700 text-white'
                          : 'border-gray-800 bg-gray-900 text-gray-300'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom input */}
              <input
                type="number"
                inputMode="decimal"
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-base text-white placeholder-gray-600 outline-none focus:border-gray-600"
                placeholder="Custom amount…"
                min="0"
                step="0.1"
                value={amount || ''}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              />

              {msg && (
                <p className={`text-sm text-center font-medium ${msg.startsWith('Bought') ? 'text-emerald-400' : 'text-red-400'}`}>
                  {msg}
                </p>
              )}

              {/* Confirm */}
              <button
                onClick={confirmTrade}
                disabled={loading || amount <= 0 || !pendingSide}
                className={`w-full py-3.5 rounded-2xl font-bold text-base transition-colors disabled:opacity-40 active:scale-[0.98] ${
                  pendingSide === 'YES'
                    ? 'bg-emerald-600'
                    : pendingSide === 'NO'
                    ? 'bg-red-700'
                    : 'bg-gray-800'
                }`}
              >
                {loading ? 'Processing…' : pendingSide ? `Buy ${pendingSide} · ${amount} ALGO` : 'Select YES or NO'}
              </button>

              <button
                onClick={closeSheet}
                className="w-full py-2.5 text-gray-500 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
