const { Contract, JsonRpcProvider, getAddress, isAddress } = require("ethers");

const STAKEMATE_READ_ABI = [
  "function challengeCount() view returns (uint256)",
  "function soloGoalCount() view returns (uint256)",
  "function challenges(uint256) view returns (address creator,address partner,address forfeitureRecipient,uint256 stakeAmount,uint256 createdAt,uint256 startTime,uint256 endTime,uint16 durationDays,uint16 requiredCheckIns,uint16 creatorCheckIns,uint16 partnerCheckIns,uint8 status,uint8 outcome,string title,uint8 verificationMode,uint8 payoutMode,uint32 reviewPeriod,uint256 reviewDeadline)",
  "function evidenceByParticipant(uint256,address) view returns (bytes32 digest,string uri,uint256 submittedAt,uint8 decision)",
  "function soloGoals(uint256) view returns (address owner,address verifier,address failureRecipient,uint256 amount,uint256 createdAt,uint256 acceptedAt,uint256 goalDeadline,uint256 reviewDeadline,uint256 resolvedAt,uint32 goalDuration,uint32 reviewPeriod,bytes32 resolutionDigest,uint8 status,string title)",
  "function soloGoalEvidence(uint256) view returns (bytes32 digest,string uri,uint256 submittedAt,uint8 decision)",
];

function serializeEvidence(value) {
  return {
    digest: value.digest,
    uri: value.uri,
    submittedAt: value.submittedAt.toString(),
    decision: Number(value.decision),
  };
}

function serializeChallenge(id, value, creatorEvidence, partnerEvidence) {
  return {
    id: id.toString(),
    creator: value.creator,
    partner: value.partner,
    forfeitureRecipient: value.forfeitureRecipient,
    stakeAmount: value.stakeAmount.toString(),
    createdAt: value.createdAt.toString(),
    startTime: value.startTime.toString(),
    endTime: value.endTime.toString(),
    durationDays: Number(value.durationDays),
    requiredCheckIns: Number(value.requiredCheckIns),
    creatorCheckIns: Number(value.creatorCheckIns),
    partnerCheckIns: Number(value.partnerCheckIns),
    status: Number(value.status),
    outcome: Number(value.outcome),
    title: value.title,
    verificationMode: Number(value.verificationMode),
    payoutMode: Number(value.payoutMode),
    reviewPeriod: Number(value.reviewPeriod),
    reviewDeadline: value.reviewDeadline.toString(),
    evidence: {
      creator: serializeEvidence(creatorEvidence),
      partner: serializeEvidence(partnerEvidence),
    },
  };
}

function serializeSoloGoal(id, value, evidence) {
  return {
    id: id.toString(),
    owner: value.owner,
    verifier: value.verifier,
    failureRecipient: value.failureRecipient,
    amount: value.amount.toString(),
    createdAt: value.createdAt.toString(),
    acceptedAt: value.acceptedAt.toString(),
    goalDeadline: value.goalDeadline.toString(),
    reviewDeadline: value.reviewDeadline.toString(),
    resolvedAt: value.resolvedAt.toString(),
    goalDuration: Number(value.goalDuration),
    reviewPeriod: Number(value.reviewPeriod),
    resolutionDigest: value.resolutionDigest,
    status: Number(value.status),
    title: value.title,
    evidence: serializeEvidence(evidence),
  };
}

function createChainReader({ rpcUrl, contractAddress }) {
  if (!rpcUrl || !isAddress(contractAddress)) return null;

  const address = getAddress(contractAddress);
  const provider = new JsonRpcProvider(rpcUrl);
  const contract = new Contract(address, STAKEMATE_READ_ABI, provider);

  return {
    address,
    async getChallenge(challengeId) {
      const id = BigInt(challengeId);
      const value = await contract.challenges(id);
      if (value.creator === "0x0000000000000000000000000000000000000000") return null;
      const [creatorEvidence, partnerEvidence] = await Promise.all([
        contract.evidenceByParticipant(id, value.creator),
        contract.evidenceByParticipant(id, value.partner),
      ]);
      return serializeChallenge(id, value, creatorEvidence, partnerEvidence);
    },
    async listRecent(limit = 20) {
      const count = await contract.challengeCount();
      const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
      const first = count > BigInt(safeLimit) ? count - BigInt(safeLimit) + 1n : 1n;
      const ids = [];
      for (let id = count; id >= first && id > 0n; id -= 1n) ids.push(id);
      return Promise.all(ids.map((id) => this.getChallenge(id)));
    },
    async getSoloGoal(soloGoalId) {
      const id = BigInt(soloGoalId);
      const value = await contract.soloGoals(id);
      if (value.owner === "0x0000000000000000000000000000000000000000") return null;
      const evidence = await contract.soloGoalEvidence(id);
      return serializeSoloGoal(id, value, evidence);
    },
    async listRecentSoloGoals(limit = 20) {
      const count = await contract.soloGoalCount();
      const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
      const first = count > BigInt(safeLimit) ? count - BigInt(safeLimit) + 1n : 1n;
      const ids = [];
      for (let id = count; id >= first && id > 0n; id -= 1n) ids.push(id);
      return Promise.all(ids.map((id) => this.getSoloGoal(id)));
    },
  };
}

module.exports = { createChainReader };
