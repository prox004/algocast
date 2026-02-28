'use client';

import { useEffect, useState, useRef } from 'react';
import QRCodeStyling from 'qr-code-styling';
import { getWalletBalance, formatAlgo, exportWalletMnemonic } from '@/lib/api';

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
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const qrInstanceRef = useRef<QRCodeStyling | null>(null);

  // Function to fetch wallet balance
  const fetchBalance = async () => {
    try {
      const data = await getWalletBalance();
      // Explicit type validation
      if (
        typeof data === 'object' &&
        data !== null &&
        typeof data.balance === 'number' &&
        typeof data.custodial_address === 'string' &&
        typeof data.email === 'string'
      ) {
        setInfo(data);
        setError('');
      } else {
        setError('Invalid wallet data from server');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load wallet';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchBalance();

    // Set up 10-second auto-refresh
    intervalRef.current = setInterval(fetchBalance, 10000);

    // Cleanup interval on unmount
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Generate QR code when address changes
  useEffect(() => {
    if (info?.custodial_address && qrRef.current) {
      // Create or update QR code instance
      if (!qrInstanceRef.current) {
        qrInstanceRef.current = new QRCodeStyling({
          width: 120,
          height: 120,
          data: info.custodial_address,
          image: undefined,
          margin: 0,
          qrOptions: {
            typeNumber: 0 as any,
            mode: 'Byte' as any,
            errorCorrectionLevel: 'H' as any,
          },
          imageOptions: {
            hideBackgroundDots: true,
            imageSize: 0.4,
            margin: 0,
          },
          dotsOptions: {
            color: '#000000',
            type: 'rounded',
          },
          backgroundOptions: {
            color: '#ffffff',
          },
          cornersSquareOptions: {
            color: '#000000',
            type: 'extra-rounded',
          },
          cornersDotOptions: {
            color: '#000000',
            type: 'dot',
          },
        });
      } else {
        qrInstanceRef.current.update({ data: info.custodial_address });
      }

      // Clear previous content and append
      qrRef.current.innerHTML = '';
      qrInstanceRef.current.append(qrRef.current);
    }
  }, [info?.custodial_address]);

  function copyAddress() {
    if (!info?.custodial_address) return;
    navigator.clipboard.writeText(info.custodial_address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copyMnemonic() {
    if (!mnemonic) return;
    navigator.clipboard.writeText(mnemonic);
  }

  async function handleManualRefresh() {
    setRefreshing(true);
    await fetchBalance();
    setTimeout(() => setRefreshing(false), 500); // Keep spinning for at least 500ms for visual feedback
  }

  async function handleExportWallet(e: React.FormEvent) {
    e.preventDefault();
    setExportError('');
    setExportLoading(true);

    try {
      const result = await exportWalletMnemonic(exportPassword);
      setMnemonic(result.mnemonic);
      setExportError('');
    } catch (err: any) {
      setExportError(err.message || 'Failed to export wallet');
      setMnemonic('');
    } finally {
      setExportLoading(false);
    }
  }

  function closeExportModal() {
    setShowExportModal(false);
    setExportPassword('');
    setMnemonic('');
    setExportError('');
  }

  if (loading) return <div className="card animate-pulse h-40" />;
  if (error) return (
    <div className="card border-red-800 text-red-400 text-sm">{error}</div>
  );
  if (!info) return null;

  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">My Wallet</h2>
          <span className="text-xs text-gray-500">{info.email}</span>
        </div>
        <div className="space-y-4">
          {/* Balance */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Balance</p>
            <div className="flex items-center gap-3">
              <p className="text-3xl font-bold text-brand-500">{formatAlgo(info.balance)}</p>
              <button
                onClick={handleManualRefresh}
                disabled={refreshing}
                className="p-2 rounded-full hover:bg-gray-800 transition-colors disabled:opacity-50"
                title="Refresh balance"
              >
                <svg
                  className={`w-5 h-5 text-gray-400 hover:text-white transition-colors ${refreshing ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1">Auto-updates every 10 seconds</p>
          </div>

          {/* QR Code and Address */}
          <div className="flex gap-4 items-start">
            {/* QR Code */}
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <div className="p-2 bg-white rounded">
                <div ref={qrRef} className="w-[120px] h-[120px]" />
              </div>
              <p className="text-xs text-gray-600 text-center">Scan to send</p>
            </div>

            {/* Address */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 mb-2">Custodial Address</p>
              <div className="flex flex-col gap-2">
                <p className="text-xs text-gray-400 font-mono break-all bg-gray-900/50 p-2 rounded">
                  {info.custodial_address}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={copyAddress}
                    className="text-xs text-gray-600 hover:text-white border border-gray-700 rounded px-3 py-1.5 transition-colors flex-1"
                  >
                    {copied ? '✓ Copied' : 'Copy Address'}
                  </button>
                  <button
                    onClick={() => setShowExportModal(true)}
                    className="text-xs text-yellow-600 hover:text-yellow-400 border border-yellow-700 rounded px-3 py-1.5 transition-colors flex-1"
                  >
                    🔑 Export Wallet
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Export Wallet Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">🔑 Export Wallet</h3>
            
            {!mnemonic ? (
              <>
                <div className="bg-yellow-900/20 border border-yellow-700 rounded p-4 mb-4">
                  <p className="text-yellow-400 text-sm font-semibold mb-2">⚠️ Security Warning</p>
                  <ul className="text-xs text-yellow-200 space-y-1">
                    <li>• Never share your recovery phrase with anyone</li>
                    <li>• Store it securely offline (paper, hardware wallet)</li>
                    <li>• Anyone with this phrase controls your wallet</li>
                    <li>• We cannot recover your wallet if you lose it</li>
                  </ul>
                </div>

                <form onSubmit={handleExportWallet} className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Enter your password to continue:
                    </label>
                    <input
                      type="password"
                      className="input w-full"
                      placeholder="Your account password"
                      value={exportPassword}
                      onChange={(e) => setExportPassword(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  {exportError && (
                    <p className="text-red-400 text-sm">{exportError}</p>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={closeExportModal}
                      className="btn-secondary flex-1"
                      disabled={exportLoading}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-primary flex-1"
                      disabled={exportLoading || !exportPassword}
                    >
                      {exportLoading ? 'Verifying...' : 'Export'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="bg-green-900/20 border border-green-700 rounded p-4 mb-4">
                  <p className="text-green-400 text-sm font-semibold mb-2">✅ Recovery Phrase</p>
                  <p className="text-xs text-gray-400 mb-3">
                    Write down these 25 words in order. You can use this phrase to recover your wallet in any Algorand wallet app.
                  </p>
                  <div className="bg-gray-950 p-4 rounded font-mono text-sm text-white break-all">
                    {mnemonic}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={copyMnemonic}
                    className="btn-secondary flex-1"
                  >
                    📋 Copy Phrase
                  </button>
                  <button
                    onClick={closeExportModal}
                    className="btn-primary flex-1"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

