# Deploy StakeMate with Remix

`StakeMate.sol` is the same tested, dependency-free contract used by the
application. It has no constructor arguments and imports no external contracts.

1. Open `https://remix.ethereum.org`.
2. Create `StakeMate.sol` in the Remix file explorer.
3. Paste the complete contents of this folder's `StakeMate.sol`.
4. Select Solidity compiler `0.8.24`.
5. Open **Advanced Configurations**, choose **Use configuration file**, and
   replace the generated `remix.config.json` with the contents of this folder's
   `remix.config.json`. This enables optimization with `200` runs and
   `viaIR`.
6. Compile `StakeMate.sol`.
7. In **Deploy & Run Transactions**, choose **Injected Provider** and confirm
   that the wallet is connected to BOT Chain Testnet, chain ID `968`.
8. Leave the deployment value at `0` and deploy `StakeMate`. The contract has no
   constructor parameters.
9. Copy the deployed contract address into the project's `.env`:

```env
VITE_STAKEMATE_CONTRACT_ADDRESS=0x...
STAKEMATE_CONTRACT_ADDRESS=0x...
```

Restart `npm run backend` and `npm run dev` after changing `.env`.

Use testnet BOT for the first deployment. Do not deploy to mainnet until the
contract and product rules have received an independent security review.
