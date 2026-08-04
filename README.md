# StakeMate

StakeMate is a non-custodial BOT Chain accountability application. A user can
lock BOT behind a personal goal with a friend verifier, or two people can lock
equal stakes in a shared pact. Commitments, check-ins, decisions, settlement,
and withdrawals are enforced by the deployed smart contract.

This branch is configured for the StakeMate deployment on BOT Chain Mainnet.

## Mainnet status

- Network: BOT Chain Mainnet
- Chain ID: `677` (`0x2a5`)
- RPC: `https://rpc.botchain.ai`
- Explorer: `https://scan.botchain.ai`
- Mainnet contract:
  [`0x7A78C82D175dAa914eac7669C5d7Aecd020261fE`](https://scan.botchain.ai/address/0x7A78C82D175dAa914eac7669C5d7Aecd020261fE)
- Deployment transaction:
  [`0x8569a1aa173137927171fb393233f2c1f190b7cfb0fb1d0048b0c0fb2486eef3`](https://scan.botchain.ai/tx/0x8569a1aa173137927171fb393233f2c1f190b7cfb0fb1d0048b0c0fb2486eef3)

The previous testnet deployment remains available at
[`0xeBca3f1605b5F9da72Ce0674f76ef2Da8AD125d3`](https://scan.bohr.life/address/0xeBca3f1605b5F9da72Ce0674f76ef2Da8AD125d3).
Testnet commitments do not move to mainnet; the same contract code must be
deployed again and will receive a new address.

Read [MAINNET_DEPLOYMENT.md](MAINNET_DEPLOYMENT.md) before deploying or
publishing this branch.

## What works

- Wallet connection, network switching, restoration, and live BOT balance
- Personal goals with an owner, verifier, and independent failure recipient
- Verifier acceptance, signed evidence, approval/rejection, and expiry
- Two-person pacts with equal stakes
- Daily on-chain check-ins or partner-reviewed evidence
- Deadline-aware finalization and neutral-recipient forfeiture
- Pull-payment withdrawals and claimable-balance display
- Public receipts and explorer links
- Mainnet warnings and explicit real-BOT confirmation before creating a stake

## Local development

For safe local testing, copy the testnet template:

```bat
copy .env.testnet.example .env
npm install
npm start
```

`npm start` launches the website at `http://localhost:5173` and the evidence API
at `http://localhost:8787`.

For a mainnet release, copy `.env.example` to `.env.production`, then fill in
the public HTTPS evidence API URL. The mainnet contract address is already
configured. Do not publish signed-evidence features with the API URL blank.

## Verify the project

```bash
npm run test:all
npm run check
npm run build
```

## Project layout

| Path | Purpose |
| --- | --- |
| `src/` | React/Vite frontend and contract integration |
| `contracts/StakeMate.sol` | Escrow, verification, and settlement rules |
| `backend/src/` | Signed-evidence and read-only chain API |
| `scripts/` | Startup, deployment, and demonstration scripts |
| `test/` | Smart-contract tests |
| `backend/test/` | Evidence API tests |
| `remix/StakeMate.sol` | Remix-ready copy of the tested contract |

The evidence API never receives a wallet private key and cannot move funds.
Never place a private key in a `VITE_` variable or commit one to Git.
