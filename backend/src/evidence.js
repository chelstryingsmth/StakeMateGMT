const {
  getAddress,
  isAddress,
  keccak256,
  toUtf8Bytes,
  verifyMessage,
} = require("ethers");

const MAX_URI_LENGTH = 512;
const MAX_NOTE_LENGTH = 2_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const MAX_EVIDENCE_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

class EvidenceValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "EvidenceValidationError";
    this.statusCode = statusCode;
  }
}

function requireAddress(value, field) {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new EvidenceValidationError(`${field} must be a valid EVM address`);
  }
  return getAddress(value);
}

function requirePositiveInteger(value, field) {
  let parsed;
  try {
    parsed = typeof value === "bigint" ? value : BigInt(String(value));
  } catch {
    throw new EvidenceValidationError(`${field} must be a positive integer`);
  }

  if (parsed <= 0n) {
    throw new EvidenceValidationError(`${field} must be a positive integer`);
  }
  return parsed.toString();
}

function normalizeEvidenceUri(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URI_LENGTH) {
    throw new EvidenceValidationError(`uri must contain 1-${MAX_URI_LENGTH} characters`);
  }

  if (value.startsWith("ipfs://") || value.startsWith("ar://")) {
    if (value.split("://")[1].length === 0) {
      throw new EvidenceValidationError("uri must include a content identifier");
    }
    return value;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new EvidenceValidationError("uri must use https://, ipfs://, or ar://");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new EvidenceValidationError("uri must use credential-free HTTPS, IPFS, or Arweave");
  }
  return parsed.toString();
}

function normalizeEvidencePayload(input, now = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new EvidenceValidationError("request body must be a JSON object");
  }

  const chainIdNumber = Number(input.chainId);
  if (!Number.isSafeInteger(chainIdNumber) || chainIdNumber <= 0) {
    throw new EvidenceValidationError("chainId must be a positive safe integer");
  }

  const issuedAt = Number(input.issuedAt);
  if (!Number.isSafeInteger(issuedAt)) {
    throw new EvidenceValidationError("issuedAt must be a Unix timestamp in milliseconds");
  }
  if (issuedAt > now + MAX_CLOCK_SKEW_MS || issuedAt < now - MAX_EVIDENCE_AGE_MS) {
    throw new EvidenceValidationError("issuedAt is outside the accepted signing window");
  }

  const note = input.note == null ? "" : String(input.note).trim();
  if (note.length > MAX_NOTE_LENGTH) {
    throw new EvidenceValidationError(`note cannot exceed ${MAX_NOTE_LENGTH} characters`);
  }

  const commitmentType =
    input.commitmentType ?? (input.soloGoalId != null ? "solo-goal" : "challenge");
  if (commitmentType !== "challenge" && commitmentType !== "solo-goal") {
    throw new EvidenceValidationError(
      'commitmentType must be either "challenge" or "solo-goal"'
    );
  }
  const rawCommitmentId =
    commitmentType === "solo-goal"
      ? input.soloGoalId ?? input.commitmentId
      : input.challengeId ?? input.commitmentId;
  const commitmentId = requirePositiveInteger(rawCommitmentId, "commitmentId");

  return {
    version: 1,
    chainId: chainIdNumber,
    contractAddress: requireAddress(input.contractAddress, "contractAddress"),
    commitmentType,
    commitmentId,
    ...(commitmentType === "challenge"
      ? { challengeId: commitmentId }
      : { soloGoalId: commitmentId }),
    participant: requireAddress(input.participant, "participant"),
    uri: normalizeEvidenceUri(input.uri),
    note,
    issuedAt,
  };
}

function canonicalizeEvidence(evidence) {
  return JSON.stringify({
    version: evidence.version,
    chainId: evidence.chainId,
    contractAddress: evidence.contractAddress.toLowerCase(),
    commitmentType: evidence.commitmentType,
    commitmentId: evidence.commitmentId,
    participant: evidence.participant.toLowerCase(),
    uri: evidence.uri,
    note: evidence.note,
    issuedAt: evidence.issuedAt,
  });
}

function prepareEvidence(input, now) {
  const evidence = normalizeEvidencePayload(input, now);
  const digest = keccak256(toUtf8Bytes(canonicalizeEvidence(evidence)));
  const signingMessage = [
    "StakeMate Evidence v1",
    `Digest: ${digest}`,
    `Chain ID: ${evidence.chainId}`,
    `Contract: ${evidence.contractAddress}`,
    `Type: ${evidence.commitmentType}`,
    `Commitment: ${evidence.commitmentId}`,
  ].join("\n");

  return { evidence, digest, signingMessage };
}

function verifyEvidenceSubmission(input, now) {
  const prepared = prepareEvidence(input, now);
  if (typeof input.signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(input.signature)) {
    throw new EvidenceValidationError("signature must be a hex-encoded wallet signature");
  }

  let signer;
  try {
    signer = getAddress(verifyMessage(prepared.signingMessage, input.signature));
  } catch {
    throw new EvidenceValidationError("signature could not be verified", 401);
  }

  if (signer !== prepared.evidence.participant) {
    throw new EvidenceValidationError("signature does not belong to participant", 401);
  }

  return {
    ...prepared,
    signature: input.signature,
    signer,
  };
}

module.exports = {
  EvidenceValidationError,
  canonicalizeEvidence,
  prepareEvidence,
  verifyEvidenceSubmission,
};
