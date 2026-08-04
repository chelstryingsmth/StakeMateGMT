# Deploy StakeMate with Remix

`StakeMate.sol` is the dependency-free contract tested by this repository. It
has no constructor arguments.

1. Review `MAINNET_DEPLOYMENT.md` and complete all pre-deployment checks.
2. Open `https://remix.ethereum.org` and create `StakeMate.sol`.
3. Paste the complete contents of this folder's `StakeMate.sol`.
4. Select Solidity compiler `0.8.24`.
5. Enable the optimizer with `200` runs and `viaIR` using this folder's
   `remix.config.json`.
6. Compile `StakeMate.sol` and confirm there are no errors.
7. In **Deploy & Run Transactions**, select **Injected Provider**.
8. Confirm the wallet shows **BOT Chain Mainnet**, chain ID `677`, and the
   intended deployer address.
9. Leave deployment value at `0`, review the estimated fee, and deploy.
10. Copy the new address and verify it on `https://scan.botchain.ai`.

Never paste a recovery phrase or private key into Remix, this repository, or a
chat. A mainnet deployment is irreversible and costs real BOT.
