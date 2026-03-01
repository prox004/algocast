'use client';

import { useEffect, useState, useCallback } from 'react';
import { getOrderBook, placeOrder, cancelOrder, getUserOrders, formatAlgo } from '@/lib/api';
import type { OrderBook as OrderBookType, Order } from '@/lib/api';

interface OrderBookProps {
  marketId: string;
  resolved: boolean;
  expired: boolean;
  isLoggedIn: boolean;
}

export default function OrderBook({ marketId, resolved, expired, isLoggedIn }: OrderBookProps) {
  const [book, setBook] = useState<OrderBookType | null>(null);
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [side, setSide] = useState<'YES' | 'NO'>('YES');
  const [price, setPrice] = useState('0.50');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchBook = useCallback(async () => {
    try {
      const data = await getOrderBook(marketId);
      setBook(data);
    } catch {
      /* ignore */
    }
  }, [marketId]);

  const fetchUserOrders = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const data = await getUserOrders();
      setUserOrders(data.orders.filter((o) => o.market_id === marketId));
    } catch {
      /* ignore */
    }
  }, [isLoggedIn, marketId]);

  useEffect(() => {
    fetchBook();
    fetchUserOrders();
    const iv = setInterval(fetchBook, 8000);
    return () => clearInterval(iv);
  }, [fetchBook, fetchUserOrders]);

  const canTrade = isLoggedIn && !resolved && !expired;

  const handlePlace = async () => {
    if (!canTrade) return;
    setError('');
    setLoading(true);
    try {
      const microAlgos = Math.round(parseFloat(amount) * 1_000_000);
      if (!microAlgos || microAlgos <= 0) throw new Error('Enter a valid amount');
      const p = parseFloat(price);
      if (!p || p <= 0 || p >= 1) throw new Error('Price must be 0.01–0.99');
      await placeOrder(marketId, side, p, microAlgos);
      setAmount('');
      fetchBook();
      fetchUserOrders();
    } catch (err: any) {
      setError(err?.message || 'Order placement failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (orderId: string) => {
    try {
      await cancelOrder(orderId);
      fetchBook();
      fetchUserOrders();
    } catch {
      /* ignore */
    }
  };

  const maxDepth = Math.max(
    ...(book?.yes.map((l) => l.amount) || [1]),
    ...(book?.no.map((l) => l.amount) || [1]),
    1,
  );

  return (
    <div className="bg-gray-900 rounded-2xl p-4 space-y-4">
      <h3 className="text-white font-semibold text-lg">Order Book</h3>

      {/* Probability bar */}
      {book && (
        <div className="text-xs text-gray-400 flex justify-between">
          <span>YES {(book.probability * 100).toFixed(1)}%</span>
          <span>NO {((1 - book.probability) * 100).toFixed(1)}%</span>
        </div>
      )}

      {/* depth columns */}
      <div className="grid grid-cols-2 gap-2">
        {/* YES bids */}
        <div>
          <div className="text-xs text-green-400 font-semibold mb-1">YES Bids</div>
          {book?.yes.length ? (
            book.yes.map((lvl, i) => (
              <div key={i} className="relative flex justify-between text-xs py-0.5 px-1 rounded">
                <div
                  className="absolute inset-0 bg-green-500/20 rounded"
                  style={{ width: `${(lvl.amount / maxDepth) * 100}%` }}
                />
                <span className="relative text-green-300">{(lvl.price * 100).toFixed(0)}¢</span>
                <span className="relative text-gray-300">{formatAlgo(lvl.amount)}</span>
              </div>
            ))
          ) : (
            <div className="text-xs text-gray-500 italic">No bids</div>
          )}
        </div>

        {/* NO bids */}
        <div>
          <div className="text-xs text-red-400 font-semibold mb-1">NO Bids</div>
          {book?.no.length ? (
            book.no.map((lvl, i) => (
              <div key={i} className="relative flex justify-between text-xs py-0.5 px-1 rounded">
                <div
                  className="absolute inset-0 bg-red-500/20 rounded"
                  style={{ width: `${(lvl.amount / maxDepth) * 100}%` }}
                />
                <span className="relative text-red-300">{(lvl.price * 100).toFixed(0)}¢</span>
                <span className="relative text-gray-300">{formatAlgo(lvl.amount)}</span>
              </div>
            ))
          ) : (
            <div className="text-xs text-gray-500 italic">No bids</div>
          )}
        </div>
      </div>

      {/* Place order form */}
      {canTrade && (
        <div className="border-t border-gray-700 pt-3 space-y-2">
          <div className="text-sm text-white font-medium">Limit Order</div>

          {/* Side toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setSide('YES')}
              className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition ${
                side === 'YES' ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-400'
              }`}
            >
              YES
            </button>
            <button
              onClick={() => setSide('NO')}
              className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition ${
                side === 'NO' ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400'
              }`}
            >
              NO
            </button>
          </div>

          {/* Price slider */}
          <div>
            <label className="text-xs text-gray-400">
              Price (probability): <span className="text-white">{(parseFloat(price) * 100).toFixed(0)}¢</span>
            </label>
            <input
              type="range"
              min="0.01"
              max="0.99"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full accent-blue-500"
            />
          </div>

          {/* Amount */}
          <input
            type="number"
            placeholder="Amount (ALGO)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />

          {error && <div className="text-xs text-red-400">{error}</div>}

          <button
            onClick={handlePlace}
            disabled={loading || !amount}
            className="w-full py-2 rounded-lg font-semibold text-sm bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition"
          >
            {loading ? 'Placing…' : `Place ${side} Limit @ ${(parseFloat(price) * 100).toFixed(0)}¢`}
          </button>
        </div>
      )}

      {/* User open orders */}
      {userOrders.filter((o) => o.status === 'open').length > 0 && (
        <div className="border-t border-gray-700 pt-3 space-y-1">
          <div className="text-sm text-white font-medium">Your Open Orders</div>
          {userOrders
            .filter((o) => o.status === 'open')
            .map((o) => (
              <div key={o.id} className="flex items-center justify-between text-xs bg-gray-800 rounded-lg px-3 py-2">
                <span className={o.side === 'YES' ? 'text-green-400' : 'text-red-400'}>
                  {o.side} @ {(o.price * 100).toFixed(0)}¢
                </span>
                <span className="text-gray-400">{formatAlgo(o.amount - o.filled)}</span>
                <button
                  onClick={() => handleCancel(o.id)}
                  className="text-red-400 hover:text-red-300 font-medium"
                >
                  Cancel
                </button>
              </div>
            ))}
        </div>
      )}

      {resolved && (
        <div className="text-center text-xs text-yellow-400 italic">Market resolved – order book closed</div>
      )}
    </div>
  );
}
