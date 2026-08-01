import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import type { WalletState } from '../types';
import {
  connectWallet,
  disconnectedWallet,
  getInjectedWallet,
  readWalletState,
  resetWalletProvider,
  revokeWalletPermissions,
} from '../services/walletService';

let walletSnapshot = disconnectedWallet;
let initialized = false;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => walletSnapshot;

function publish(next: WalletState) {
  walletSnapshot = next;
  listeners.forEach((listener) => listener());
}

async function refreshExistingWallet() {
  try {
    publish(await readWalletState(false));
  } catch {
    publish(disconnectedWallet);
  }
}

function initializeWallet() {
  if (initialized) return;
  initialized = true;
  void refreshExistingWallet();

  const ethereum = getInjectedWallet();
  if (!ethereum?.on) return;
  const handleWalletChange = () => {
    resetWalletProvider();
    void refreshExistingWallet();
  };
  ethereum.on('accountsChanged', handleWalletChange);
  ethereum.on('chainChanged', handleWalletChange);
}

export function useWallet() {
  const wallet = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(initializeWallet, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const next = await connectWallet();
      publish(next);
      return next;
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'Could not connect wallet.';
      setError(message);
      throw reason;
    } finally {
      setConnecting(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const next = await readWalletState(false);
    publish(next);
    return next;
  }, []);

  const disconnect = useCallback(async () => {
    await revokeWalletPermissions();
    resetWalletProvider();
    publish(disconnectedWallet);
    setError(null);
  }, []);

  return { ...wallet, connecting, error, connect, refresh, disconnect };
}
