# StakeMate

StakeMate is a real BOT Chain accountability application. A user can lock BOT
behind a personal goal with a friend verifier, or two people can lock equal
stakes in a shared pact. The application uses the deployed contract for every
commitment, check-in, decision, settlement, and withdrawal—there is no frontend
demo-data mode.

Testnet contract:
[`0xeBca3f1605b5F9da72Ce0674f76ef2Da8AD125d3`](https://scan.bohr.life/address/0xeBca3f1605b5F9da72Ce0674f76ef2Da8AD125d3)

## What works

- Wallet connection, network switching, account restoration, and live balance
- Personal goals with an owner, verifier, and independent failure recipient
- Verifier acceptance before a solo goal becomes irreversible
- Signed evidence submission and replacement before the goal deadline
- Verifier approval or rejection during the agreed review window
- Permissionless expiry when a verifier ignores the review
- Two-person pacts with equal stakes
- Daily on-chain check-ins with one check-in per wallet per day
- Signed final evidence with cross-review by the other participant
- Deadline-aware finalization and neutral-recipient forfeiture
- Claimable-balance display and pull-payment withdrawals
- Explorer links for the deployment, wallets, and confirmed transactions

## Run StakeMate

Install dependencies, then copy `.env.example` to `.env`.

```bash
npm install
copy .env.example .env
npm start
```

`npm start` launches both services:

- website: `http://localhost:5173`
- evidence API: `http://localhost:8787`

If you prefer separate terminals, use:

```bash
npm run backend
npm run dev
```

Open the website in a browser with MetaMask or BO Wallet, connect to BOT Chain
Testnet, and use the `/app` workspace. Testnet BOT is still real testnet currency:
review addresses, rules, and amounts in the wallet confirmation before signing.

## Routes

- `/` — product landing page
- `/app` — live contract workspace

Old prototype routes redirect to `/app`, so users cannot accidentally enter a
simulated dashboard.

## Verify the project

```bash
npm run test:all
npm run check
npm run build
```

The contract suite covers escrow, roles, check-ins, proof review, deadlines,
settlement, refunds, solo goals, and withdrawals. The backend suite covers
canonical evidence preparation, wallet-signature verification, storage, and
commitment isolation.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/` | React/Vite application and contract integration |
| `contracts/StakeMate.sol` | Escrow, verification, and settlement rules |
| `backend/src/` | Signed-evidence API and read-only chain API |
| `scripts/` | Local startup, deployment, and console demonstrations |
| `test/` | Smart-contract tests |
| `backend/test/` | Evidence API tests |
| `remix/StakeMate.sol` | Remix-ready copy of the tested contract |

## Evidence flow

1. The app asks the API to canonicalize the evidence metadata.
2. The user signs that canonical record with their wallet.
3. The API verifies the signer and stores the signed record.
4. The app anchors the record’s digest and public URI on-chain.
5. The authorized reviewer records approval or rejection on-chain.

The evidence API has no wallet private key and cannot move funds. Never place a
private key in a `VITE_` environment variable.

## Network

| Network | Chain ID | RPC | Explorer |
| --- | ---: | --- | --- |
| BOT Chain Testnet | 968 | `https://rpc.bohr.life` | `https://scan.bohr.life` |
| BOT Chain Mainnet | 677 | `https://rpc.botchain.ai` | `https://scan.botchain.ai` |
