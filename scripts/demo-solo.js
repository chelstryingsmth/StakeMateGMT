const { ethers } = require("hardhat");

async function main() {
  const [owner, verifier, failureRecipient] = await ethers.getSigners();

  console.log("\n1. Deploying a fresh local StakeMate contract...");
  const StakeMate = await ethers.getContractFactory("StakeMate");
  const stakeMate = await StakeMate.deploy();
  await stakeMate.waitForDeployment();
  console.log("   Contract:", await stakeMate.getAddress());

  console.log("\n2. Owner creates a goal and locks 1 BOT...");
  await (
    await stakeMate
      .connect(owner)
      .createSoloGoal(
        verifier.address,
        failureRecipient.address,
        60 * 60,
        60 * 60,
        "Finish the StakeMate demo",
        { value: ethers.parseEther("1") }
      )
  ).wait();
  console.log("   Goal #1 status: PendingVerifier");
  console.log("   Owner:", owner.address);
  console.log("   Verifier:", verifier.address);

  console.log("\n3. The invited friend accepts the verifier role...");
  await (await stakeMate.connect(verifier).acceptSoloGoal(1)).wait();
  console.log("   Goal #1 status: Active");

  console.log("\n4. Owner submits a proof digest and public URI...");
  const digest = ethers.id("StakeMate demo proof");
  await (
    await stakeMate
      .connect(owner)
      .submitSoloGoalEvidence(1, digest, "https://example.com/stakemate-proof")
  ).wait();
  console.log("   Evidence digest:", digest);

  console.log("\n5. Advancing the local chain past the goal deadline...");
  await ethers.provider.send("evm_increaseTime", [60 * 60 + 1]);
  await ethers.provider.send("evm_mine");

  console.log("\n6. The verifier approves the completed goal...");
  await (await stakeMate.connect(verifier).approveSoloGoal(1)).wait();
  const claimable = await stakeMate.claimable(owner.address);
  console.log("   Goal #1 status: Approved");
  console.log("   Owner can withdraw:", ethers.formatEther(claimable), "BOT");

  console.log("\n7. Owner withdraws the released BOT...");
  await (await stakeMate.connect(owner).withdrawPayout()).wait();
  console.log(
    "   Claimable after withdrawal:",
    ethers.formatEther(await stakeMate.claimable(owner.address)),
    "BOT"
  );
  console.log("\nDemo complete. No real network or real BOT was used.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
