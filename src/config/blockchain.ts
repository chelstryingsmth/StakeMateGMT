const NETWORKS = {
  testnet: {
    chainId: 968,
    chainIdHex: '0x3c8',
    chainName: 'BOT Chain Testnet',
    rpcUrl: 'https://rpc.bohr.life',
    explorerUrl: 'https://scan.bohr.life',
    nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  },
  mainnet: {
    chainId: 677,
    chainIdHex: '0x2a5',
    chainName: 'BOT Chain',
    rpcUrl: 'https://rpc.botchain.ai',
    explorerUrl: 'https://scan.botchain.ai',
    nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  },
} as const;

const networkName =
  import.meta.env.VITE_BOT_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

export const BOT_CHAIN_CONFIG = {
  ...NETWORKS[networkName],
  networkName,
  contractAddress:
    (import.meta.env.VITE_STAKEMATE_CONTRACT_ADDRESS as string | undefined)?.trim() ?? '',
  evidenceApiUrl:
    (import.meta.env.VITE_EVIDENCE_API_URL as string | undefined)?.trim() ??
    'http://localhost:8787',
};

export const isContractConfigured = /^0x[0-9a-fA-F]{40}$/.test(
  BOT_CHAIN_CONFIG.contractAddress,
);
