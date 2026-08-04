const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer configured. Set DEPLOYER_PRIVATE_KEY or deploy through Remix.");
  }

  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const balance = await ethers.provider.getBalance(deployer.address);
  const isBotMainnet = chainId === 677;

  if (isBotMainnet && process.env.CONFIRM_MAINNET_DEPLOY !== "YES") {
    throw new Error(
      "Mainnet deployment blocked. Review MAINNET_DEPLOYMENT.md, then set CONFIRM_MAINNET_DEPLOY=YES for this command only."
    );
  }

  console.log("Network chain ID:", chainId);
  console.log("Deploying StakeMate with:", deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "BOT");

  const StakeMate = await ethers.getContractFactory("StakeMate");
  const deploymentRequest = await StakeMate.getDeployTransaction();
  const estimatedGas = await ethers.provider.estimateGas({
    ...deploymentRequest,
    from: deployer.address,
  });
  console.log("Estimated deployment gas:", estimatedGas.toString());

  const stakeMate = await StakeMate.deploy();
  await stakeMate.waitForDeployment();

  console.log("StakeMate deployed to:", await stakeMate.getAddress());
  const explorerUrl =
    chainId === 677
      ? "https://scan.botchain.ai"
      : chainId === 968
        ? "https://scan.bohr.life"
        : null;
  if (explorerUrl) {
    console.log("Explorer:", `${explorerUrl}/address/${await stakeMate.getAddress()}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
