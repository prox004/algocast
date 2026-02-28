'use client';

import { useEffect, useState, useRef } from 'react';
import QRCodeStyling from 'qr-code-styling';
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

    // Set up 30-second auto-refresh
    intervalRef.current = setInterval(fetchBalance, 30000);

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

  if (loading) return <div className="card animate-pulse h-40" />;
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
      <div className="space-y-4">
        {/* Balance */}
        <div>
          <p className="text-xs text-gray-500 mb-1">Balance</p>
          <p className="text-3xl font-bold text-brand-500">{formatAlgo(info.balance)}</p>
          <p className="text-xs text-gray-600 mt-1">Auto-updates every 30 seconds</p>
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
              <button
                onClick={copyAddress}
                className="text-xs text-gray-600 hover:text-white border border-gray-700 rounded px-3 py-1.5 transition-colors w-full"
              >
                {copied ? '✓ Copied' : 'Copy Address'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

