'use client';

import { useEffect, useState } from 'react';
import { getWalletBalance, formatAlgo } from '@/lib/api';

interface WalletInfo {
  balance: number;
  custodial_address: string;
  email: string;
}

export default function WalletBalance() {
  const [info, setInfo] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getWalletBalance()
      .then(setInfo)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function copyAddress() {
    if (!info?.custodial_address) return;
    navigator.clipboard.writeText(info.custodial_address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <div className="card animate-pulse h-28" />;
  if (error) return (
    <div className="card border-red-800 text-red-400 text-sm">{error}</div>
  );
  if (!info) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">My Wallet</h2>
        <span className="text-xs text-gray-500">{info.email}</span>
      </div>
      <div className="space-y-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">Balance</p>
          <p className="text-3xl font-bold text-brand-500">{formatAlgo(info.balance)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Custodial Address</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-400 font-mono break-all flex-1">
              {info.custodial_address}
            </p>
            <button
              onClick={copyAddress}
              className="shrink-0 text-xs text-gray-600 hover:text-white border border-gray-700 rounded px-2 py-1 transition-colors"
            >
              {copied ? '✓' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

