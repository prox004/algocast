'use client';

import { useEffect, useState } from 'react';
import { getToken, formatAlgo } from '@/lib/api';

// Decode JWT payload (no verification — frontend only)
function parseJwtPayload(token: string): { id?: string; email?: string } {
  try {
    const base64 = token.split('.')[1];
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

interface WalletInfo {
  balance: number;
  custodial_address: string;
  email: string;
}

export default function WalletBalance() {
  const [info, setInfo] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }

    // Fetch fresh user data from backend by hitting /auth/login won't work here.
    // Instead we decode the JWT for email and hit a /me pattern.
    // Since we don't have /me, we use deposit(0) workaround — or decode JWT only.
    const payload = parseJwtPayload(token);

    // Fetch balance by calling a 0-amount deposit (safe: amount validated server-side)
    // Better: we can just decode and display what we have; balance needs a dedicated /me endpoint.
    // For hackathon: store balance in localStorage on each operation and read here.
    const stored = localStorage.getItem('castalgo_balance');
    const storedAddress = localStorage.getItem('castalgo_address');

    setInfo({
      balance: stored ? parseInt(stored, 10) : 0,
      custodial_address: storedAddress || '—',
      email: payload.email || '—',
    });
    setLoading(false);
  }, []);

  if (loading) return <div className="card animate-pulse h-24" />;
  if (!info) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">My Wallet</h2>
        <span className="text-xs text-gray-600">{info.email}</span>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">Balance</p>
          <p className="text-3xl font-bold text-brand-500">{formatAlgo(info.balance)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Custodial Address</p>
          <p className="text-xs text-gray-400 font-mono break-all">{info.custodial_address}</p>
        </div>
      </div>
    </div>
  );
}
