# StakeMate

**Put real BOT behind your word.**

StakeMate is an on-chain accountability protocol on BOT Chain. You lock BOT
against a goal - solo with a verifier, or head-to-head with a partner - and the
smart contract, not a promise, decides how the stake is settled. There is no
demo mode and no mock contract data: every check-in, evidence anchor, review,
settlement, and withdrawal in the app is a real transaction against the
deployed contract.

Built for the **BOTChain Build Week** hackathon.

- **Live app:** https://stakemate.online
- **Mainnet contract:**
  [`0x7A78C82D175dAa914eac7669C5d7Aecd020261fE`](https://scan.botchain.ai/address/0x7A78C82D175dAa914eac7669C5d7Aecd020261fE)
  on BOT Chain Mainnet (chain ID `677`)
- **Deployment transaction:**
  [`0x8569a1aa173137927171fb393233f2c1f190b7cfb0fb1d0048b0c0fb2486eef3`](https://scan.botchain.ai/tx/0x8569a1aa173137927171fb393233f2c1f190b7cfb0fb1d0048b0c0fb2486eef3)
- **Testnet contract:**
  [`0xeBca3f1605b5F9da72Ce0674f76ef2Da8AD125d3`](https://scan.bohr.life/address/0xeBca3f1605b5F9da72Ce0674f76ef2Da8AD125d3)
  on BOT Chain Testnet (chain ID `968`)
- **Contract source:** [`contracts/StakeMate.sol`](contracts/StakeMate.sol),
  mirrored for Remix at [`remix/StakeMate.sol`](remix/StakeMate.sol)

The testnet and mainnet contracts contain the same tested code but are separate
deployments with separate state. Testnet commitments do not migrate to mainnet.

---

## The problem

Personal commitments such as "I'll go to the gym five times this week" or
"I'll finish this by Friday" are easy to break because there is no real cost
to breaking them. StakeMate adds one: your own money, locked in a contract that
settles according to the rules chosen before the commitment begins.

## How it works

StakeMate supports two commitment types, both enforced on-chain.

### 1. Solo goals (verifier-reviewed)

1. **Create** a goal, stake BOT, and name a verifier plus an independent failure
   recipient.
2. The **verifier accepts**. Until then, the creator can cancel and recover the
   stake.
3. The creator **submits signed evidence** before the deadline. Evidence can be
   replaced while the submission window remains open.
4. The verifier **approves or rejects** during the agreed review window.
5. Approval credits the stake back to the creator. Rejection or an ignored
   review settles it to the independent failure recipient, never the verifier.

### 2. Two-person challenges

1. The creator opens a challenge with a stake, duration, partner, and neutral
   failure recipient. They choose either:
   - **Daily check-in mode:** both participants check in on-chain once per day.
   - **Evidence mode:** both participants submit signed evidence and review one
     another after the deadline.
2. The invited partner **joins** by matching the stake.
3. Both participants complete check-ins or submit evidence under the same fixed
   rules.
4. At the deadline, anyone can **finalize**. The contract computes whether both,
   one, or neither participant succeeded and credits the correct payouts.
5. Recipients claim credited BOT through a **pull-payment withdrawal**.

Escrow, roles, check-ins, evidence digests, review decisions, deadlines,
settlement, refunds, and withdrawals live in one Solidity contract. There is no
admin function that can override an outcome or take a user's stake.

---

## What is on-chain and off-chain

| Component | Role |
| --- | --- |
| **Smart contract** (`contracts/StakeMate.sol`) | Holds BOT stakes and is the source of truth for commitment status, outcomes, and payouts. |
| **Evidence API** (`backend/src/`) | Canonicalizes evidence metadata, verifies the participant's wallet signature, and stores the signed record. It has no private key and cannot move funds. |
| **Frontend** (`src/`) | React/Vite application that talks directly to the contract through `ethers.js` and uses the evidence API for signed-proof bookkeeping. |

### Evidence flow

1. The frontend asks the API to canonicalize evidence metadata.
2. The participant signs the canonical record with MetaMask or BO Wallet.
3. The API verifies the signature and stores the signed record.
4. The frontend anchors the evidence digest and public URI on-chain.
5. The authorized verifier or counterparty records the decision on-chain.

The backend is a proof-record service, not a funds custodian. A production
deployment must configure a persistent public HTTPS evidence API; GitHub Pages
can host the frontend but cannot run the Node backend.

---

## Use BOT Chain Mainnet

The mainnet release uses real BOT. Configure the wallet with:

| Field | Value |
| --- | --- |
| Network name | BOT Chain Mainnet |
| RPC URL | `https://rpc.botchain.ai` |
| Chain ID | `677` |
| Currency symbol | BOT |
| Explorer | `https://scan.botchain.ai` |

Open https://stakemate.online, connect MetaMask or BO Wallet, and enter the
workspace. Review the contract address, participants, stake, deadline, and
wallet confirmation before signing. Start with the smallest practical canary
stake.

For free rehearsals, copy `.env.testnet.example` to `.env` and use BOT Chain
Testnet instead. The testnet network uses chain ID `968`, RPC
`https://rpc.bohr.life`, and explorer `https://scan.bohr.life`.

## Run locally

```bat
npm install
copy .env.testnet.example .env
npm start
```

`npm start` runs both local services:

- Frontend: `http://localhost:5173`
- Evidence API: `http://localhost:8787`

Or run them separately:

```bash
npm run backend
npm run dev
```

For a production build, copy `.env.example` to `.env.production` and set
`VITE_EVIDENCE_API_URL` to the hosted HTTPS API. The mainnet contract address
is already included in the mainnet configuration.

## Verify the project

```bash
npm run test:all
npm run check
npm run build
```

The contract suite covers escrow, participant roles, check-ins, evidence review,
deadlines, settlement, refunds, solo goals, and withdrawals. The backend suite
covers canonical evidence preparation, signature verification, storage,
commitment isolation, and mainnet deployment restrictions.

---

## Project layout

| Path | Purpose |
| --- | --- |
| `contracts/StakeMate.sol` | Escrow, verification, and settlement logic |
| `src/` | React/Vite frontend and contract integration |
| `backend/src/` | Evidence canonicalization, signature verification, storage, and read-only chain API |
| `scripts/` | Local startup, deployment, and demonstration scripts |
| `test/` | Hardhat smart-contract test suite |
| `backend/test/` | Evidence API test suite |
| `remix/StakeMate.sol` | Remix-ready copy of the tested contract |
| `MAINNET_DEPLOYMENT.md` | Mainnet cutover and release-verification checklist |

## Network reference

| Network | Chain ID | RPC | Explorer |
| --- | ---: | --- | --- |
| BOT Chain Mainnet | 677 | `https://rpc.botchain.ai` | `https://scan.botchain.ai` |
| BOT Chain Testnet | 968 | `https://rpc.bohr.life` | `https://scan.bohr.life` |

## Deployment

Read [`MAINNET_DEPLOYMENT.md`](MAINNET_DEPLOYMENT.md) before changing or
redeploying the production contract.

```bash
npm run compile
npm run deploy:testnet
npm run deploy:mainnet
```

The mainnet deployment script requires both a securely injected
`DEPLOYER_PRIVATE_KEY` and the explicit `CONFIRM_MAINNET_DEPLOY=YES` safety
flag. Never commit a private key or place one in a `VITE_` variable because
Vite variables are bundled into client-side JavaScript.

---

## Security notes

- The contract has no owner-controlled fund movement. Outcomes are determined
  by fixed roles, deadlines, check-ins, and evidence decisions.
- Withdrawals use a pull-payment pattern with reentrancy protection.
- The verifier never receives a rejected solo stake; it goes to the independent
  failure recipient selected at creation.
- The evidence backend holds no private key and cannot withdraw contract funds.
- Automated tests are not a security audit. Do not use meaningful mainnet funds
  until the contract has received an independent Solidity security review.
- Mainnet transactions are irreversible. Always verify the connected network,
  contract address, amount, and recipient addresses before signing.
