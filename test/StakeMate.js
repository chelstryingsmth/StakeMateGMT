const { expect } = require("chai");
const { ethers } = require("hardhat");

const DAY = 24 * 60 * 60;
const REVIEW_PERIOD = 6 * 60 * 60;
const EVIDENCE_DIGEST = ethers.id("stakemate-evidence-record");
const EVIDENCE_URI = "ipfs://bafybeigdyrzt/stakemate-evidence.json";

async function moveTo(timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
  await ethers.provider.send("evm_mine", []);
}

async function expectCustomError(promise, contract, errorName) {
  try {
    await promise;
    expect.fail(`Expected ${errorName} to be raised`);
  } catch (error) {
    const data = error.data ?? error.error?.data ?? error.info?.error?.data;
    const parsed = data ? contract.interface.parseError(data) : null;
    expect(parsed?.name).to.equal(errorName);
  }
}

describe("StakeMate", function () {
  let stakeMate;
  let creator;
  let partner;
  let beneficiary;
  let outsider;
  const stake = ethers.parseEther("1");

  beforeEach(async function () {
    [creator, partner, beneficiary, outsider] = await ethers.getSigners();
    const StakeMate = await ethers.getContractFactory("StakeMate");
    stakeMate = await StakeMate.deploy();
    await stakeMate.waitForDeployment();
  });

  async function createChallenge({ duration = 2, required = 2 } = {}) {
    await stakeMate.connect(creator).createChallenge(
      partner.address,
      beneficiary.address,
      duration,
      required,
      "Ship the StakeMate MVP",
      { value: stake }
    );
    return 1n;
  }

  async function createAndJoin(options = {}) {
    const id = await createChallenge(options);
    await stakeMate.connect(partner).joinChallenge(id, { value: stake });
    return id;
  }

  async function createEvidenceChallenge({ duration = 1, reviewPeriod = REVIEW_PERIOD } = {}) {
    await stakeMate.connect(creator).createEvidenceChallenge(
      partner.address,
      beneficiary.address,
      duration,
      reviewPeriod,
      "Finish the real-world milestone",
      { value: stake }
    );
    return 1n;
  }

  async function createAndJoinEvidence(options = {}) {
    const id = await createEvidenceChallenge(options);
    await stakeMate.connect(partner).joinChallenge(id, { value: stake });
    return id;
  }

  async function createSoloGoal({
    verifier = partner,
    failureRecipient = beneficiary,
    goalDuration = DAY,
    reviewPeriod = REVIEW_PERIOD,
  } = {}) {
    await stakeMate.connect(creator).createSoloGoal(
      verifier.address,
      failureRecipient.address,
      goalDuration,
      reviewPeriod,
      "Complete the certification",
      { value: stake }
    );
    return 1n;
  }

  it("creates a pending challenge and escrows the creator stake", async function () {
    const id = await createChallenge();
    const challenge = await stakeMate.challenges(id);

    expect(challenge.creator).to.equal(creator.address);
    expect(challenge.partner).to.equal(partner.address);
    expect(challenge.stakeAmount).to.equal(stake);
    expect(challenge.status).to.equal(0n);
    expect(await ethers.provider.getBalance(await stakeMate.getAddress())).to.equal(stake);
  });

  it("only allows the invited partner to join with an equal stake", async function () {
    const id = await createChallenge();

    await expectCustomError(
      stakeMate.connect(outsider).joinChallenge(id, { value: stake }),
      stakeMate,
      "NotInvitedPartner"
    );

    await expectCustomError(
      stakeMate.connect(partner).joinChallenge(id, { value: stake / 2n }),
      stakeMate,
      "InvalidStake"
    );

    await stakeMate.connect(partner).joinChallenge(id, { value: stake });
    const challenge = await stakeMate.challenges(id);
    expect(challenge.status).to.equal(1n);
    expect(challenge.endTime - challenge.startTime).to.equal(2n * BigInt(DAY));
  });

  it("records at most one check-in per participant per day", async function () {
    const id = await createAndJoin();
    await stakeMate.connect(creator).checkIn(id);

    await expectCustomError(
      stakeMate.connect(creator).checkIn(id),
      stakeMate,
      "AlreadyCheckedIn"
    );

    expect(await stakeMate.hasCheckedIn(id, creator.address, 0)).to.equal(true);

    const challenge = await stakeMate.challenges(id);
    await moveTo(challenge.startTime + BigInt(DAY));
    await stakeMate.connect(creator).checkIn(id);

    const updated = await stakeMate.challenges(id);
    expect(updated.creatorCheckIns).to.equal(2n);
  });

  it("returns each stake when both participants succeed", async function () {
    const id = await createAndJoin();
    let challenge = await stakeMate.challenges(id);

    await stakeMate.connect(creator).checkIn(id);
    await stakeMate.connect(partner).checkIn(id);
    await moveTo(challenge.startTime + BigInt(DAY));
    await stakeMate.connect(creator).checkIn(id);
    await stakeMate.connect(partner).checkIn(id);

    challenge = await stakeMate.challenges(id);
    await moveTo(challenge.endTime);
    await stakeMate.connect(outsider).finalizeChallenge(id);

    expect(await stakeMate.claimable(creator.address)).to.equal(stake);
    expect(await stakeMate.claimable(partner.address)).to.equal(stake);
    expect((await stakeMate.challenges(id)).outcome).to.equal(1n);
  });

  it("awards both stakes to the only successful participant", async function () {
    const id = await createAndJoin({ duration: 1, required: 1 });
    await stakeMate.connect(partner).checkIn(id);

    const challenge = await stakeMate.challenges(id);
    await moveTo(challenge.endTime);
    await stakeMate.finalizeChallenge(id);

    expect(await stakeMate.claimable(partner.address)).to.equal(stake * 2n);
    expect(await stakeMate.claimable(creator.address)).to.equal(0n);
    expect((await stakeMate.challenges(id)).outcome).to.equal(3n);
  });

  it("credits both stakes to the beneficiary when both participants fail", async function () {
    const id = await createAndJoin({ duration: 1, required: 1 });
    const challenge = await stakeMate.challenges(id);
    await moveTo(challenge.endTime);
    await stakeMate.finalizeChallenge(id);

    expect(await stakeMate.claimable(beneficiary.address)).to.equal(stake * 2n);
    expect((await stakeMate.challenges(id)).outcome).to.equal(4n);
  });

  it("allows the creator to cancel an unjoined challenge and withdraw", async function () {
    const id = await createChallenge();
    await stakeMate.connect(creator).cancelUnjoinedChallenge(id);

    expect(await stakeMate.claimable(creator.address)).to.equal(stake);
    expect((await stakeMate.challenges(id)).status).to.equal(3n);

    await stakeMate.connect(creator).withdrawPayout();
    expect(await stakeMate.claimable(creator.address)).to.equal(0n);
    expect(await ethers.provider.getBalance(await stakeMate.getAddress())).to.equal(0n);
  });

  it("rejects invalid challenge settings and premature finalization", async function () {
    await expectCustomError(
      stakeMate.connect(creator).createChallenge(
        partner.address,
        beneficiary.address,
        2,
        3,
        "Impossible threshold",
        { value: stake }
      ),
      stakeMate,
      "InvalidRequiredCheckIns"
    );

    const id = await createAndJoin();
    await expectCustomError(
      stakeMate.finalizeChallenge(id),
      stakeMate,
      "ChallengeNotEnded"
    );
  });

  it("creates an evidence challenge with a fixed review deadline and safe payout mode", async function () {
    const id = await createAndJoinEvidence();
    const challenge = await stakeMate.challenges(id);

    expect(challenge.verificationMode).to.equal(1n);
    expect(challenge.payoutMode).to.equal(1n);
    expect(challenge.reviewPeriod).to.equal(BigInt(REVIEW_PERIOD));
    expect(challenge.reviewDeadline - challenge.endTime).to.equal(BigInt(REVIEW_PERIOD));
    expect(challenge.requiredCheckIns).to.equal(0n);
  });

  it("requires a neutral forfeiture recipient", async function () {
    await expectCustomError(
      stakeMate.connect(creator).createEvidenceChallenge(
        partner.address,
        partner.address,
        1,
        REVIEW_PERIOD,
        "Biased recipient",
        { value: stake }
      ),
      stakeMate,
      "InvalidAddress"
    );
  });

  it("accepts signed-record digests only from challenge participants", async function () {
    const id = await createAndJoinEvidence();

    await expectCustomError(
      stakeMate.connect(outsider).submitEvidence(id, EVIDENCE_DIGEST, EVIDENCE_URI),
      stakeMate,
      "NotParticipant"
    );
    await expectCustomError(
      stakeMate.connect(creator).submitEvidence(id, ethers.ZeroHash, EVIDENCE_URI),
      stakeMate,
      "InvalidEvidence"
    );

    await stakeMate.connect(creator).submitEvidence(id, EVIDENCE_DIGEST, EVIDENCE_URI);
    const evidence = await stakeMate.evidenceByParticipant(id, creator.address);
    expect(evidence.digest).to.equal(EVIDENCE_DIGEST);
    expect(evidence.uri).to.equal(EVIDENCE_URI);
    expect(evidence.decision).to.equal(0n);
  });

  it("only lets the counterparty review evidence after the challenge ends", async function () {
    const id = await createAndJoinEvidence();
    await stakeMate.connect(creator).submitEvidence(id, EVIDENCE_DIGEST, EVIDENCE_URI);

    await expectCustomError(
      stakeMate.connect(partner).reviewEvidence(id, creator.address, true),
      stakeMate,
      "ChallengeNotEnded"
    );

    const challenge = await stakeMate.challenges(id);
    await moveTo(challenge.endTime);

    await expectCustomError(
      stakeMate.connect(outsider).reviewEvidence(id, creator.address, true),
      stakeMate,
      "NotReviewer"
    );
    await stakeMate.connect(partner).reviewEvidence(id, creator.address, true);
    expect((await stakeMate.evidenceByParticipant(id, creator.address)).decision).to.equal(1n);
  });

  it("returns both individual stakes when both evidence records are approved", async function () {
    const id = await createAndJoinEvidence();
    await stakeMate.connect(creator).submitEvidence(id, EVIDENCE_DIGEST, EVIDENCE_URI);
    await stakeMate.connect(partner).submitEvidence(id, ethers.id("partner-evidence"), EVIDENCE_URI);

    const challenge = await stakeMate.challenges(id);
    await moveTo(challenge.endTime);
    await stakeMate.connect(partner).reviewEvidence(id, creator.address, true);
    await stakeMate.connect(creator).reviewEvidence(id, partner.address, true);
    await stakeMate.connect(outsider).finalizeChallenge(id);

    expect(await stakeMate.claimable(creator.address)).to.equal(stake);
    expect(await stakeMate.claimable(partner.address)).to.equal(stake);
    expect(await stakeMate.claimable(beneficiary.address)).to.equal(0n);
    expect((await stakeMate.challenges(id)).outcome).to.equal(1n);
  });

  it("sends a rejected participant's stake to the neutral recipient, not the reviewer", async function () {
    const id = await createAndJoinEvidence();
    await stakeMate.connect(creator).submitEvidence(id, EVIDENCE_DIGEST, EVIDENCE_URI);
    await stakeMate.connect(partner).submitEvidence(id, ethers.id("partner-evidence"), EVIDENCE_URI);

    const challenge = await stakeMate.challenges(id);
    await moveTo(challenge.endTime);
    await stakeMate.connect(partner).reviewEvidence(id, creator.address, false);
    await stakeMate.connect(creator).reviewEvidence(id, partner.address, true);
    await stakeMate.finalizeChallenge(id);

    expect(await stakeMate.claimable(creator.address)).to.equal(0n);
    expect(await stakeMate.claimable(partner.address)).to.equal(stake);
    expect(await stakeMate.claimable(beneficiary.address)).to.equal(stake);
    expect((await stakeMate.challenges(id)).outcome).to.equal(3n);
  });

  it("auto-approves submitted evidence when its reviewer stays silent", async function () {
    const id = await createAndJoinEvidence();
    await stakeMate.connect(creator).submitEvidence(id, EVIDENCE_DIGEST, EVIDENCE_URI);

    let challenge = await stakeMate.challenges(id);
    await moveTo(challenge.endTime);
    await expectCustomError(
      stakeMate.finalizeChallenge(id),
      stakeMate,
      "ReviewStillOpen"
    );

    challenge = await stakeMate.challenges(id);
    await moveTo(challenge.reviewDeadline);
    await stakeMate.connect(outsider).finalizeChallenge(id);

    expect((await stakeMate.evidenceByParticipant(id, creator.address)).decision).to.equal(1n);
    expect(await stakeMate.claimable(creator.address)).to.equal(stake);
    expect(await stakeMate.claimable(partner.address)).to.equal(0n);
    expect(await stakeMate.claimable(beneficiary.address)).to.equal(stake);
  });

  it("allows early settlement once every submitted record has a decision", async function () {
    const id = await createAndJoinEvidence();
    await stakeMate.connect(creator).submitEvidence(id, EVIDENCE_DIGEST, EVIDENCE_URI);

    const challenge = await stakeMate.challenges(id);
    await moveTo(challenge.endTime);
    await stakeMate.connect(partner).reviewEvidence(id, creator.address, true);
    await stakeMate.finalizeChallenge(id);

    expect(await stakeMate.claimable(creator.address)).to.equal(stake);
    expect(await stakeMate.claimable(beneficiary.address)).to.equal(stake);
    expect((await stakeMate.challenges(id)).outcome).to.equal(2n);
  });

  it("creates a pending solo goal that becomes irreversible only after verifier acceptance", async function () {
    const id = await createSoloGoal();
    let goal = await stakeMate.soloGoals(id);

    expect(goal.owner).to.equal(creator.address);
    expect(goal.verifier).to.equal(partner.address);
    expect(goal.failureRecipient).to.equal(beneficiary.address);
    expect(goal.amount).to.equal(stake);
    expect(goal.goalDeadline).to.equal(0n);
    expect(goal.status).to.equal(0n);

    await expectCustomError(
      stakeMate.connect(outsider).acceptSoloGoal(id),
      stakeMate,
      "NotGoalVerifier"
    );

    await stakeMate.connect(partner).acceptSoloGoal(id);
    goal = await stakeMate.soloGoals(id);
    expect(goal.status).to.equal(1n);
    expect(goal.goalDeadline - goal.acceptedAt).to.equal(BigInt(DAY));
    expect(goal.reviewDeadline - goal.goalDeadline).to.equal(BigInt(REVIEW_PERIOD));
  });

  it("allows the owner to cancel only before verifier acceptance", async function () {
    const id = await createSoloGoal();

    await expectCustomError(
      stakeMate.connect(outsider).cancelPendingSoloGoal(id),
      stakeMate,
      "NotGoalOwner"
    );
    await stakeMate.connect(creator).cancelPendingSoloGoal(id);

    expect((await stakeMate.soloGoals(id)).status).to.equal(4n);
    expect(await stakeMate.claimable(creator.address)).to.equal(stake);

    await expectCustomError(
      stakeMate.connect(partner).acceptSoloGoal(id),
      stakeMate,
      "InvalidStatus"
    );
  });

  it("releases a solo goal only after evidence and verifier approval", async function () {
    const id = await createSoloGoal();
    await stakeMate.connect(partner).acceptSoloGoal(id);
    await stakeMate
      .connect(creator)
      .submitSoloGoalEvidence(id, EVIDENCE_DIGEST, EVIDENCE_URI);

    const goal = await stakeMate.soloGoals(id);
    await moveTo(goal.goalDeadline);

    await expectCustomError(
      stakeMate.connect(creator).approveSoloGoal(id),
      stakeMate,
      "NotGoalVerifier"
    );
    await stakeMate.connect(partner).approveSoloGoal(id);

    const approved = await stakeMate.soloGoals(id);
    expect(approved.status).to.equal(2n);
    expect(approved.resolutionDigest).to.equal(EVIDENCE_DIGEST);
    expect((await stakeMate.soloGoalEvidence(id)).decision).to.equal(1n);
    expect(await stakeMate.claimable(creator.address)).to.equal(stake);
    expect(await stakeMate.claimable(partner.address)).to.equal(0n);

    await expectCustomError(
      stakeMate.connect(partner).approveSoloGoal(id),
      stakeMate,
      "InvalidStatus"
    );

    await stakeMate.connect(creator).withdrawPayout();
    expect(await stakeMate.claimable(creator.address)).to.equal(0n);
    expect(await ethers.provider.getBalance(await stakeMate.getAddress())).to.equal(0n);
  });

  it("forfeits a rejected goal to the neutral recipient, never the verifier", async function () {
    const id = await createSoloGoal();
    await stakeMate.connect(partner).acceptSoloGoal(id);

    const goal = await stakeMate.soloGoals(id);
    await moveTo(goal.goalDeadline);
    const reasonDigest = ethers.id("requirements-not-met");
    await stakeMate.connect(partner).rejectSoloGoal(id, reasonDigest);

    const rejected = await stakeMate.soloGoals(id);
    expect(rejected.status).to.equal(3n);
    expect(rejected.resolutionDigest).to.equal(reasonDigest);
    expect(await stakeMate.claimable(creator.address)).to.equal(0n);
    expect(await stakeMate.claimable(partner.address)).to.equal(0n);
    expect(await stakeMate.claimable(beneficiary.address)).to.equal(stake);
  });

  it("settles an ignored solo review to the neutral recipient after timeout", async function () {
    const id = await createSoloGoal();
    await stakeMate.connect(partner).acceptSoloGoal(id);
    await stakeMate
      .connect(creator)
      .submitSoloGoalEvidence(id, EVIDENCE_DIGEST, EVIDENCE_URI);

    const goal = await stakeMate.soloGoals(id);
    await moveTo(goal.reviewDeadline + 1n);

    await expectCustomError(
      stakeMate.connect(partner).approveSoloGoal(id),
      stakeMate,
      "ReviewWindowClosed"
    );
    await stakeMate.connect(outsider).finalizeExpiredSoloGoal(id);

    expect((await stakeMate.soloGoals(id)).status).to.equal(5n);
    expect(await stakeMate.claimable(beneficiary.address)).to.equal(stake);
  });

  it("accepts solo evidence only from the owner before the goal deadline", async function () {
    const id = await createSoloGoal();
    await stakeMate.connect(partner).acceptSoloGoal(id);

    await expectCustomError(
      stakeMate.connect(outsider).submitSoloGoalEvidence(id, EVIDENCE_DIGEST, EVIDENCE_URI),
      stakeMate,
      "NotGoalOwner"
    );
    await expectCustomError(
      stakeMate.connect(creator).submitSoloGoalEvidence(id, ethers.ZeroHash, EVIDENCE_URI),
      stakeMate,
      "InvalidEvidence"
    );

    const goal = await stakeMate.soloGoals(id);
    await moveTo(goal.goalDeadline);
    await expectCustomError(
      stakeMate.connect(creator).submitSoloGoalEvidence(id, EVIDENCE_DIGEST, EVIDENCE_URI),
      stakeMate,
      "GoalSubmissionClosed"
    );
  });

  it("rejects unsafe solo goal settings and unknown goal IDs", async function () {
    await expectCustomError(
      stakeMate.connect(creator).createSoloGoal(
        creator.address,
        beneficiary.address,
        DAY,
        REVIEW_PERIOD,
        "Self verified",
        { value: stake }
      ),
      stakeMate,
      "InvalidAddress"
    );

    await expectCustomError(
      stakeMate.connect(creator).createSoloGoal(
        partner.address,
        beneficiary.address,
        0,
        REVIEW_PERIOD,
        "No evidence window",
        { value: stake }
      ),
      stakeMate,
      "InvalidLockDuration"
    );

    const maximumDuration = await stakeMate.MAX_SOLO_LOCK_DURATION();
    await expectCustomError(
      stakeMate.connect(creator).createSoloGoal(
        partner.address,
        beneficiary.address,
        maximumDuration + 1n,
        REVIEW_PERIOD,
        "Too far away",
        { value: stake }
      ),
      stakeMate,
      "InvalidLockDuration"
    );

    await expectCustomError(
      stakeMate.connect(partner).approveSoloGoal(999),
      stakeMate,
      "SoloGoalNotFound"
    );
  });
});
