const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer configured. Set DEPLOYER_PRIVATE_KEY or deploy through Remix.");
  }

  console.log("Deploying StakeMate with:", deployer.address);

  const StakeMate = await ethers.getContractFactory("StakeMate");
  const stakeMate = await StakeMate.deploy();
  await stakeMate.waitForDeployment();

  console.log("StakeMate deployed to:", await stakeMate.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
