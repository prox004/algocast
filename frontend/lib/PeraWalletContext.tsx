'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { PeraWalletConnect } from '@perawallet/connect';
import algosdk from 'algosdk';

interface PeraWalletState {
  /** Connected Pera Wallet address or null */
  peraAddress: string | null;
  /** Whether the SDK is currently connecting */
  connecting: boolean;
  /** Connect to Pera Wallet — opens the modal */
  connect: () => Promise<string | null>;
  /** Disconnect Pera Wallet */
  disconnect: () => void;
  /** Sign arbitrary bytes with the connected wallet — returns signed bytes */
  signTransaction: (txnBytes: Uint8Array) => Promise<Uint8Array>;
}

const PeraWalletCtx = createContext<PeraWalletState>({
  peraAddress: null,
  connecting: false,
  connect: async () => null,
  disconnect: () => {},
  signTransaction: async () => new Uint8Array(),
});

export const usePeraWallet = () => useContext(PeraWalletCtx);

export function PeraWalletProvider({ children }: { children: ReactNode }) {
  const peraRef = useRef<PeraWalletConnect | null>(null);
  const [peraAddress, setPeraAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Create the PeraWalletConnect instance once (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pera = new PeraWalletConnect({
      chainId: 416002, // Algorand TestNet
    });
    peraRef.current = pera;

    // Try to reconnect previous session
    pera
      .reconnectSession()
      .then((accounts) => {
        if (accounts.length > 0) {
          setPeraAddress(accounts[0]);
          pera.connector?.on('disconnect', handleDisconnect);
        }
      })
      .catch(() => {
        // No previous session — ignore
      });

    return () => {
      pera.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDisconnect() {
    setPeraAddress(null);
  }

  const connect = useCallback(async (): Promise<string | null> => {
    const pera = peraRef.current;
    if (!pera) return null;

    setConnecting(true);
    try {
      const accounts = await pera.connect();
      if (accounts.length > 0) {
        setPeraAddress(accounts[0]);
        pera.connector?.on('disconnect', handleDisconnect);
        return accounts[0];
      }
      return null;
    } catch (err) {
      // User rejected or error
      console.error('[PeraWallet] connect error:', err);
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    peraRef.current?.disconnect();
    setPeraAddress(null);
  }, []);

  /**
   * Sign a single transaction from base64-encoded unsigned txn bytes.
   * Returns the signed transaction bytes.
   */
  const signTransaction = useCallback(
    async (txnBytes: Uint8Array): Promise<Uint8Array> => {
      const pera = peraRef.current;
      if (!pera || !peraAddress) throw new Error('Pera Wallet not connected');

      // Decode raw bytes into an algosdk Transaction object
      const txn = algosdk.decodeUnsignedTransaction(txnBytes);

      const signedTxns = await pera.signTransaction([
        [{ txn, signers: [peraAddress] }],
      ]);
      return signedTxns[0];
    },
    [peraAddress],
  );

  return (
    <PeraWalletCtx.Provider value={{ peraAddress, connecting, connect, disconnect, signTransaction }}>
      {children}
    </PeraWalletCtx.Provider>
  );
}
