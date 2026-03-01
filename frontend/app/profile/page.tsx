'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  getToken,
  formatAlgo,
  getProfile,
  getWalletChallenge,
  verifyWalletOwnership,
  disconnectExternalWallet,
  withdraw,
  getWalletTransactions,
  type UserProfile,
  type WalletTransaction,
} from '@/lib/api';
import { usePeraWallet } from '@/lib/PeraWalletContext';
import WalletBalance from '@/components/WalletBalance';
import TradesHistory from '@/components/TradesHistory';
import algosdk from 'algosdk';

const LABEL_CONFIG: Record<string, { text: string; color: string; icon: string }> = {
  deposit: { text: 'Deposit', color: 'text-emerald-400', icon: '↓' },
  bet_escrow: { text: 'Bet Placed', color: 'text-amber-400', icon: '↑' },
  claim_payout: { text: 'Claim Payout', color: 'text-emerald-400', icon: '↓' },
  withdrawal: { text: 'Withdrawal', color: 'text-red-400', icon: '↑' },
  contract_call: { text: 'Contract Call', color: 'text-purple-400', icon: '⚡' },
  unknown: { text: 'Transaction', color: 'text-gray-400', icon: '•' },
};

export default function ProfilePage() {
  const router = useRouter();
  const { peraAddress, connecting, connect, disconnect: peraDisconnect } = usePeraWallet();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'wallet' | 'transactions' | 'trades'>('wallet');

  // Wallet verification
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifySuccess, setVerifySuccess] = useState('');

  // Withdraw
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState('');
  const [withdrawIsError, setWithdrawIsError] = useState(false);

  // Transaction history
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    loadProfile();
  }, [router, refreshKey]);

  async function loadProfile() {
    setLoading(true);
    try {
      const data = await getProfile();
      setProfile(data);
    } catch {
      // token expired
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }

  // Load transactions when tab switches
  useEffect(() => {
    if (tab === 'transactions') {
      setTxLoading(true);
      getWalletTransactions(30)
        .then((data) => setTransactions(data.transactions))
        .catch(() => {})
        .finally(() => setTxLoading(false));
    }
  }, [tab, refreshKey]);

  // ── Pera Connect + Verify Flow ───────────────────────────────────────────

  const handleConnectAndVerify = useCallback(async () => {
    setVerifyError('');
    setVerifySuccess('');

    // Step 1: Connect Pera Wallet if not connected
    let address = peraAddress;
    if (!address) {
      address = await connect();
    }
    if (!address) {
      setVerifyError('Failed to connect Pera Wallet');
      return;
    }

    // Step 2: Get challenge from backend
    setVerifying(true);
    try {
      const challenge = await getWalletChallenge(address);

      // Step 3: Decode the unsigned txn and sign with Pera
      const { PeraWalletConnect } = await import('@perawallet/connect');
      // We need to use the existing Pera instance or create temp one for signing
      const pera = new PeraWalletConnect({ chainId: 416002 });
      // Reconnect so the session is active
      try {
        await pera.reconnectSession();
      } catch {
        // If reconnect fails, connect fresh
        await pera.connect();
      }

      const txnBytes = Uint8Array.from(atob(challenge.txnBase64), (c) => c.charCodeAt(0));
      const txn = algosdk.decodeUnsignedTransaction(txnBytes);

      const signedTxns = await pera.signTransaction([
        [{ txn, signers: [address] }],
      ]);

      const signedTxnBase64 = btoa(
        String.fromCharCode(...signedTxns[0]),
      );

      // Step 4: Send to backend for verification
      const result = await verifyWalletOwnership(
        challenge.nonce,
        signedTxnBase64,
        address,
      );

      setVerifySuccess(`Wallet verified! ${address.slice(0, 8)}…${address.slice(-6)}`);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      console.error('[verify]', err);
      setVerifyError(err?.message || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  }, [peraAddress, connect]);

  const handleDisconnectExternal = useCallback(async () => {
    try {
      await disconnectExternalWallet();
      peraDisconnect();
      setVerifySuccess('');
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      setVerifyError(err?.message || 'Failed to disconnect');
    }
  }, [peraDisconnect]);

  // ── Withdraw ─────────────────────────────────────────────────────────────

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setWithdrawMsg('');
    setWithdrawIsError(false);

    const micro = Math.floor(parseFloat(withdrawAmount) * 1_000_000);
    if (!micro || micro <= 0) {
      setWithdrawMsg('Enter a valid ALGO amount');
      setWithdrawIsError(true);
      return;
    }

    setWithdrawing(true);
    try {
      const res = await withdraw(micro);
      setWithdrawMsg(`Withdrawn! Tx: ${res.txid?.slice(0, 12)}… — New balance: ${formatAlgo(res.balance)}`);
      setWithdrawAmount('');
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      setWithdrawIsError(true);
      setWithdrawMsg(err.message);
    } finally {
      setWithdrawing(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  const hasVerifiedWallet = !!profile.external_wallet && !!profile.external_wallet_verified_at;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ── Profile Header ────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-2xl font-bold text-white flex-shrink-0">
            {profile.email.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white truncate">{profile.email}</h1>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {profile.oauth_provider && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-400 border border-blue-800/50">
                  {profile.oauth_provider.charAt(0).toUpperCase() + profile.oauth_provider.slice(1)} OAuth
                </span>
              )}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
                Joined {new Date(profile.created_at).toLocaleDateString()}
              </span>
            </div>

            {/* Custodial address */}
            <div className="mt-3 bg-gray-800/60 rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-500 mb-0.5">Custodial Wallet (Platform)</p>
              <p className="text-xs text-gray-300 font-mono break-all">{profile.custodial_address}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Balance Card ──────────────────────────────────────────── */}
      <WalletBalance key={refreshKey} />

      {/* ── External Wallet Connection ────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <h2 className="text-lg font-bold">External Wallet</h2>
        </div>

        {hasVerifiedWallet ? (
          /* Connected & Verified state */
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm text-emerald-400 font-semibold">Verified & Connected</span>
            </div>

            <div className="bg-gray-800/60 rounded-lg px-3 py-2.5 mb-3">
              <p className="text-[10px] text-gray-500 mb-0.5">Pera Wallet Address</p>
              <p className="text-xs text-emerald-300 font-mono break-all">{profile.external_wallet}</p>
              <p className="text-[10px] text-gray-600 mt-1">
                Verified {new Date(profile.external_wallet_verified_at!).toLocaleString()}
              </p>
            </div>

            <button
              onClick={handleDisconnectExternal}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Disconnect External Wallet
            </button>
          </div>
        ) : (
          /* Not connected state */
          <div>
            <p className="text-sm text-gray-400 mb-4">
              Connect your Pera Wallet and sign a verification message to prove ownership.
              Withdrawals are sent to your verified external wallet.
            </p>

            <button
              onClick={handleConnectAndVerify}
              disabled={verifying || connecting}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {verifying || connecting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {connecting ? 'Connecting Pera…' : 'Verifying ownership…'}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Connect Pera Wallet & Verify
                </>
              )}
            </button>

            {peraAddress && !hasVerifiedWallet && (
              <p className="text-xs text-amber-400 mt-2">
                Pera connected: {peraAddress.slice(0, 8)}…{peraAddress.slice(-6)} — Verification pending
              </p>
            )}
          </div>
        )}

        {verifyError && (
          <p className="text-sm text-red-400 bg-red-900/20 px-3 py-2 rounded mt-3">{verifyError}</p>
        )}
        {verifySuccess && (
          <p className="text-sm text-emerald-400 bg-emerald-900/20 px-3 py-2 rounded mt-3">{verifySuccess}</p>
        )}
      </div>

      {/* ── Withdraw Section ──────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h2 className="text-lg font-bold mb-4">Withdraw ALGO</h2>

        {!hasVerifiedWallet ? (
          <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-3">
            <p className="text-sm text-amber-400">
              <strong>External wallet required.</strong> Connect and verify your Pera Wallet above to enable withdrawals.
            </p>
          </div>
        ) : (
          <form onSubmit={handleWithdraw} className="space-y-4">
            <div className="bg-gray-800/60 rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-500">Withdraw to</p>
              <p className="text-xs text-emerald-300 font-mono break-all">{profile.external_wallet}</p>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">Amount (ALGO)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                placeholder="0.0"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
              />
            </div>

            {withdrawMsg && (
              <p className={`text-sm px-3 py-2 rounded ${withdrawIsError ? 'text-red-400 bg-red-900/20' : 'text-emerald-400 bg-emerald-900/20'}`}>
                {withdrawMsg}
              </p>
            )}

            <button type="submit" disabled={withdrawing} className="btn-primary w-full">
              {withdrawing ? 'Sending…' : 'Withdraw to External Wallet'}
            </button>

            <p className="text-xs text-gray-600">
              Funds are sent from your custodial wallet to your verified Pera Wallet on TestNet.
            </p>
          </form>
        )}
      </div>

      {/* ── Tabs: Transactions / Trades ───────────────────────────── */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('transactions')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
            tab === 'transactions'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          On-Chain Activity
        </button>
        <button
          onClick={() => setTab('trades')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
            tab === 'trades'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          My Trades
        </button>
      </div>

      {/* ── On-Chain Transactions ──────────────────────────────────── */}
      {tab === 'transactions' && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">On-Chain Transactions</h2>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="text-xs text-purple-400 hover:text-purple-300"
            >
              Refresh
            </button>
          </div>

          {txLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">No transactions yet.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
              {transactions.map((tx) => {
                const cfg = LABEL_CONFIG[tx.label] || LABEL_CONFIG.unknown;
                const isIncoming = tx.label === 'deposit' || tx.label === 'claim_payout';
                return (
                  <a
                    key={tx.id}
                    href={tx.explorer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 bg-gray-800/50 border border-gray-700/40 rounded-xl p-3 hover:border-gray-600 transition-colors"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${isIncoming ? 'bg-emerald-900/30' : 'bg-red-900/30'}`}>
                      <span className={cfg.color}>{cfg.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${cfg.color}`}>{cfg.text}</p>
                      <p className="text-[10px] text-gray-500">{new Date(tx.timestamp * 1000).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${isIncoming ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isIncoming ? '+' : '-'}{formatAlgo(tx.amount)}
                      </p>
                      {tx.fee > 0 && (
                        <p className="text-[10px] text-gray-600">fee: {(tx.fee / 1e6).toFixed(4)}</p>
                      )}
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Trades ─────────────────────────────────────────────────── */}
      {tab === 'trades' && <TradesHistory />}
    </div>
  );
}
