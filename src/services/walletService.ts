import {
  BrowserProvider,
  formatEther,
  type Eip1193Provider,
  type Signer,
} from 'ethers';
import { BOT_CHAIN_CONFIG } from '../config/blockchain';
import type { WalletState } from '../types';

export type InjectedWallet = Eip1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => void;
};

declare global {
  interface Window {
    ethereum?: InjectedWallet;
  }
}

let browserProvider: BrowserProvider | null = null;

export const disconnectedWallet: WalletState = {
  address: null,
  connected: false,
  network: 'Wrong network',
  balance: 0,
  chainId: null,
};

function requireInjectedWallet(): InjectedWallet {
  if (!window.ethereum) {
    throw new Error('No wallet found. Install MetaMask or BO Wallet first.');
  }
  return window.ethereum;
}

export function getInjectedWallet(): InjectedWallet | undefined {
  return window.ethereum;
}

export function resetWalletProvider(): void {
  browserProvider = null;
}

function providerFor(ethereum: InjectedWallet): BrowserProvider {
  if (!browserProvider) browserProvider = new BrowserProvider(ethereum);
  return browserProvider;
}

export async function switchToBOTChain(): Promise<void> {
  const ethereum = requireInjectedWallet();
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BOT_CHAIN_CONFIG.chainIdHex }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw error;
    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: BOT_CHAIN_CONFIG.chainIdHex,
          chainName: BOT_CHAIN_CONFIG.chainName,
          nativeCurrency: BOT_CHAIN_CONFIG.nativeCurrency,
          rpcUrls: [BOT_CHAIN_CONFIG.rpcUrl],
          blockExplorerUrls: [BOT_CHAIN_CONFIG.explorerUrl],
        },
      ],
    });
  }
  resetWalletProvider();
}

export async function readWalletState(
  requestAccess = false,
): Promise<WalletState> {
  const ethereum = getInjectedWallet();
  if (!ethereum) return disconnectedWallet;

  const accounts = (await ethereum.request({
    method: requestAccess ? 'eth_requestAccounts' : 'eth_accounts',
  })) as string[];
  if (!accounts?.length) return disconnectedWallet;

  const provider = providerFor(ethereum);
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const address = accounts[0];
  const balance = Number(formatEther(await provider.getBalance(address)));

  return {
    address,
    connected: true,
    network:
      chainId === BOT_CHAIN_CONFIG.chainId ? 'BOT Chain' : 'Wrong network',
    balance,
    chainId,
  };
}

export async function connectWallet(): Promise<WalletState> {
  await readWalletState(true);
  await switchToBOTChain();
  return readWalletState(false);
}

export async function getWalletBalance(): Promise<number> {
  const signer = await getSigner();
  const address = await signer.getAddress();
  const provider = signer.provider;
  if (!provider) throw new Error('Wallet provider is unavailable.');
  return Number(formatEther(await provider.getBalance(address)));
}

export async function getSigner(): Promise<Signer> {
  const state = await readWalletState(false);
  if (!state.connected) {
    throw new Error('Connect your wallet before sending a transaction.');
  }
  if (state.chainId !== BOT_CHAIN_CONFIG.chainId) {
    await switchToBOTChain();
  }
  return providerFor(requireInjectedWallet()).getSigner();
}

export function getBrowserProvider(): BrowserProvider | null {
  return browserProvider;
}
