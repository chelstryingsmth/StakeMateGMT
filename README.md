# StakeMate

A responsive, frontend-only prototype for a two-person Web3 accountability app. It uses mock pacts and local UI state only—no wallet, BOT Chain, contract, backend, database, or transactions are connected.

## Run locally

```bash
npm install
npm run dev
```

Run `npm run check` for TypeScript validation and `npm run build` for a production build.

## Routes

- `/` — landing page
- `/dashboard` — mock pact overview
- `/pacts/new` — four-step pact creation flow
- `/pacts/1`, `/pacts/2`, `/pacts/3`, `/pacts/4` — pact states
- `/pacts/:id/history` — commitment history
- `/pacts/:id/results` — results/finalization UI

## Future integration

Blockchain values belong in `src/config/blockchain.ts`, and the final ABI belongs in `src/contracts/StakeMateABI.ts`. Replace the mock-throwing functions in `src/services/walletService.ts` and `src/services/pactService.ts` with MetaMask, ethers.js, BOT Chain, and deployed-contract logic. Pages consume mock data through hooks, so integration can be swapped in without redesigning UI components.
