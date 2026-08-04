# BOT Chain Mainnet cutover

StakeMate is deployed on BOT Chain Mainnet at
`0x7A78C82D175dAa914eac7669C5d7Aecd020261fE`. The existing testnet commitments
remain on BOT Chain Testnet and are not migrated.

## 1. Pre-deployment gate

- Freeze the exact source in `contracts/StakeMate.sol` and confirm it matches
  `remix/StakeMate.sol`.
- Run `npm run test:all`, `npm run check`, and `npm run build`.
- Obtain an independent Solidity security review before accepting meaningful
  real funds. Automated tests are not a security audit.
- Use a dedicated deployer wallet with only enough BOT for deployment.
- Confirm the wallet network is BOT Chain Mainnet, chain ID `677` (`0x2a5`).
- Never share the deployer private key or recovery phrase.

## 2. Deploy the contract

The recommended hackathon-friendly route is Remix; follow `remix/README.md`.
The repository also supports Hardhat, but only use it if your deployer key is
injected by a trusted local secret manager. The command is deliberately guarded:

```powershell
# DEPLOYER_PRIVATE_KEY must already be supplied by your secret manager.
$env:CONFIRM_MAINNET_DEPLOY="YES"
npm run deploy:mainnet
Remove-Item Env:CONFIRM_MAINNET_DEPLOY
```

Prefer entering secrets only in your own terminal or deployment platform. Do
not save the private key in `.env`, shell history, screenshots, or chat.

The deployed address is
`0x7A78C82D175dAa914eac7669C5d7Aecd020261fE`, created by transaction
`0x8569a1aa173137927171fb393233f2c1f190b7cfb0fb1d0048b0c0fb2486eef3`.
Check both on `https://scan.botchain.ai` and make one small canary commitment
before larger amounts are used.

## 3. Configure production

Copy `.env.example` to `.env.production` and fill both blank values:

```env
VITE_BOT_NETWORK=mainnet
VITE_STAKEMATE_CONTRACT_ADDRESS=0x7A78C82D175dAa914eac7669C5d7Aecd020261fE
VITE_EVIDENCE_API_URL=https://YOUR_PUBLIC_EVIDENCE_API
```

Configure the hosted evidence API with the same deployment:

```env
CORS_ORIGIN=https://stakemate.online
BOT_RPC_URL=https://rpc.botchain.ai
BOT_CHAIN_ID=677
STAKEMATE_CONTRACT_ADDRESS=0x7A78C82D175dAa914eac7669C5d7Aecd020261fE
EVIDENCE_STORE_PATH=backend/data/evidence-mainnet.json
```

GitHub Pages hosts only the static frontend. The Node evidence API must be
hosted separately on a persistent HTTPS service. Without it, on-chain check-in
pacts still work, but signed-evidence and friend-verifier proof submission do
not.

## 4. Release verification

Before publishing:

1. Open the production build and confirm it says `BOT Chain`, not `Testnet`.
2. Confirm every contract link opens the new address on `scan.botchain.ai`.
3. Confirm the evidence service reports online.
4. Create one minimum-value solo goal with three separate controlled wallets.
5. Complete acceptance, proof, review, settlement, and withdrawal.
6. Repeat with one minimum-value two-person pact.
7. Only then update the public website.

Keep the testnet build available for demonstrations and continued testing.
