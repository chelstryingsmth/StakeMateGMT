import {
  Contract,
  JsonRpcProvider,
  ZeroHash,
  formatEther,
  id as hashText,
  parseEther,
  type ContractTransactionResponse,
} from 'ethers';
import { BOT_CHAIN_CONFIG, isContractConfigured } from '../config/blockchain';
import { STAKEMATE_ABI } from '../contracts/StakeMateABI';
import type {
  CreateSoloGoalInput,
  Evidence,
  Pact,
  PactOutcome,
  Participant,
  ReviewDecision,
  SoloGoal,
  SoloGoalStatus,
  VerificationMode,
} from '../types';
import { getBrowserProvider, getSigner } from './walletService';

export interface CreatePactInput {
  partner: string;
  failureRecipient: string;
  durationDays: number;
  requiredCheckIns: number;
  reviewPeriodSeconds: number;
  title: string;
  stakeBot: string;
  mode: VerificationMode;
}

export interface EvidenceInput {
  uri: string;
  note?: string;
}

export interface CheckInState {
  dayIndex: number | null;
  checked: boolean;
}

export type TransactionProgressPhase = 'submitted' | 'confirmed';

export interface TransactionProgressDetail {
  phase: TransactionProgressPhase;
  hash: string;
}

export const STAKEMATE_TRANSACTION_EVENT = 'stakemate:transaction-progress';

type RawChallenge = {
  creator: string;
  partner: string;
  forfeitureRecipient: string;
  stakeAmount: bigint;
  createdAt: bigint;
  startTime: bigint;
  endTime: bigint;
  durationDays: bigint;
  requiredCheckIns: bigint;
  creatorCheckIns: bigint;
  partnerCheckIns: bigint;
  status: bigint;
  outcome: bigint;
  title: string;
  verificationMode: bigint;
  payoutMode: bigint;
  reviewPeriod: bigint;
  reviewDeadline: bigint;
};

type RawEvidence = {
  digest: string;
  uri: string;
  submittedAt: bigint;
  decision: bigint;
};

type RawSoloGoal = {
  owner: string;
  verifier: string;
  failureRecipient: string;
  amount: bigint;
  createdAt: bigint;
  acceptedAt: bigint;
  goalDeadline: bigint;
  reviewDeadline: bigint;
  resolvedAt: bigint;
  goalDuration: bigint;
  reviewPeriod: bigint;
  resolutionDigest: string;
  status: bigint;
  title: string;
};

const errorMessages: Record<string, string> = {
  InvalidAddress: 'Use three different, valid wallet addresses.',
  InvalidStake: 'Enter a positive BOT amount. A partner must match it exactly.',
  InvalidDuration: 'Choose a duration between 1 and 365 days.',
  InvalidRequiredCheckIns:
    'Required check-ins must be at least 1 and no greater than the duration.',
  InvalidReviewPeriod: 'Choose a review window between 1 hour and 30 days.',
  InvalidTitle: 'The title is required and must be 100 characters or fewer.',
  InvalidEvidence: 'Add valid evidence before continuing.',
  InvalidStatus: 'This action is not available in the commitment’s current state.',
  NotCreator: 'Only the pact creator can do that.',
  NotInvitedPartner: 'Connect the wallet that was invited to this pact.',
  NotParticipant: 'Only a participant in this pact can do that.',
  NotReviewer: 'Only the other participant can review this evidence.',
  NotGoalOwner: 'Only the goal owner can do that.',
  NotGoalVerifier: 'Connect the verifier wallet to do that.',
  AlreadyCheckedIn: 'This wallet has already checked in for the current day.',
  AlreadyReviewed: 'This evidence has already been reviewed.',
  ChallengeEnded: 'The pact deadline has passed.',
  ChallengeNotEnded: 'This pact cannot be finalized before its deadline.',
  ReviewStillOpen:
    'The evidence review is still open. Review submitted proof or wait for the deadline.',
  ReviewWindowClosed: 'The evidence review window has closed.',
  ApprovalTooEarly: 'The verifier can review this goal only after its goal deadline.',
  GoalSubmissionClosed: 'The goal evidence deadline has passed.',
  GoalNotExpired: 'The verifier’s review window has not expired yet.',
  WrongVerificationMode: 'That action does not match this pact’s verification mode.',
  NothingToWithdraw: 'This wallet has no claimable BOT yet.',
};

export function friendlyContractError(reason: unknown): string {
  const error = reason as {
    code?: number | string;
    shortMessage?: string;
    reason?: string;
    message?: string;
    info?: { error?: { message?: string } };
  };
  if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
    return 'The transaction was cancelled in your wallet.';
  }
  const source =
    error?.shortMessage ??
    error?.reason ??
    error?.info?.error?.message ??
    error?.message ??
    'The transaction could not be completed.';
  const known = Object.entries(errorMessages).find(([name]) =>
    source.includes(name),
  );
  if (known) return known[1];
  if (/failed to fetch|fetch failed|networkerror/i.test(source)) {
    return 'The evidence service is unreachable. Start it with “npm run backend” and try again.';
  }
  return source
    .replace(/^execution reverted:?\s*/i, '')
    .replace(/^could not coalesce error\s*/i, '')
    .slice(0, 280);
}

function requireConfiguredAddress(): string {
  if (!isContractConfigured) {
    throw new Error(
      'StakeMate is not configured. Set VITE_STAKEMATE_CONTRACT_ADDRESS in .env.',
    );
  }
  return BOT_CHAIN_CONFIG.contractAddress;
}

function readContract(): Contract {
  const provider =
    getBrowserProvider() ?? new JsonRpcProvider(BOT_CHAIN_CONFIG.rpcUrl);
  return new Contract(requireConfiguredAddress(), STAKEMATE_ABI, provider);
}

async function writeContract(): Promise<Contract> {
  return new Contract(
    requireConfiguredAddress(),
    STAKEMATE_ABI,
    await getSigner(),
  );
}

async function send(
  operation: (contract: Contract) => Promise<ContractTransactionResponse>,
): Promise<ContractTransactionResponse> {
  const transaction = await operation(await writeContract());
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<TransactionProgressDetail>(STAKEMATE_TRANSACTION_EVENT, {
        detail: { phase: 'submitted', hash: transaction.hash },
      }),
    );
  }
  await transaction.wait();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<TransactionProgressDetail>(STAKEMATE_TRANSACTION_EVENT, {
        detail: { phase: 'confirmed', hash: transaction.hash },
      }),
    );
  }
  return transaction;
}

const shortAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

function participant(
  address: string,
  passed: number,
  required: number,
): Participant {
  return {
    address,
    name: shortAddress(address),
    avatar: address.slice(2, 4).toUpperCase(),
    passed,
    failed: Math.max(0, required - passed),
    pending: Math.max(0, required - passed),
    streak: passed,
  };
}

function displayDate(seconds: number): string {
  if (!seconds) return 'Not started';
  return new Date(seconds * 1_000).toLocaleDateString();
}

const challengeStatuses: Pact['status'][] = [
  'waiting',
  'active',
  'finalized',
  'cancelled',
];

const challengeOutcomes: PactOutcome[] = [
  'pending',
  'both-succeeded',
  'creator-succeeded',
  'partner-succeeded',
  'both-failed',
];

const decisions: ReviewDecision[] = [
  'pending',
  'approved',
  'rejected',
];

function mapEvidence(raw: RawEvidence): Evidence {
  return {
    digest: raw.digest,
    uri: raw.uri,
    submittedAt: Number(raw.submittedAt),
    decision:
      raw.digest === ZeroHash
        ? 'none'
        : decisions[Number(raw.decision)] ?? 'pending',
  };
}

function mapChallenge(
  id: bigint,
  raw: RawChallenge,
  creatorEvidence: RawEvidence,
  partnerEvidence: RawEvidence,
): Pact {
  const duration = Number(raw.durationDays);
  const required = Number(raw.requiredCheckIns);
  const creatorCheckIns = Number(raw.creatorCheckIns);
  const partnerCheckIns = Number(raw.partnerCheckIns);
  const mode: VerificationMode =
    Number(raw.verificationMode) === 0 ? 'onchain' : 'peer';
  const status =
    challengeStatuses[Number(raw.status)] ?? ('cancelled' as const);
  const startTime = Number(raw.startTime);
  const endTime = Number(raw.endTime);
  const now = Math.floor(Date.now() / 1_000);
  const currentDay =
    status === 'active' && startTime
      ? Math.min(
          duration,
          Math.max(1, Math.floor((now - startTime) / 86_400) + 1),
        )
      : status === 'waiting'
        ? 0
        : duration;
  const outcome =
    challengeOutcomes[Number(raw.outcome)] ?? ('pending' as const);

  let nextAction = 'Invitation waiting for the partner';
  if (status === 'active' && now < endTime) {
    nextAction =
      mode === 'onchain'
        ? 'Record today’s on-chain check-in'
        : 'Submit signed completion evidence';
  } else if (status === 'active' && mode === 'peer') {
    nextAction =
      now <= Number(raw.reviewDeadline)
        ? 'Review the other participant’s evidence'
        : 'Finalize the result';
  } else if (status === 'active') {
    nextAction = 'Finalize the result';
  } else if (status === 'finalized') {
    nextAction = 'Withdraw any credited BOT';
  } else if (status === 'cancelled') {
    nextAction = 'Creator can withdraw the returned BOT';
  }

  return {
    id: id.toString(),
    title: raw.title,
    description:
      mode === 'onchain'
        ? `${required} check-ins are required from each participant.`
        : 'Each participant submits signed proof and reviews the other person.',
    creator: raw.creator,
    partnerAddress: raw.partner,
    forfeitureRecipient: raw.forfeitureRecipient,
    partner: participant(raw.partner, partnerCheckIns, required),
    you: participant(raw.creator, creatorCheckIns, required),
    mode,
    status,
    outcome,
    payoutMode:
      Number(raw.payoutMode) === 0
        ? 'winner-takes-pool'
        : 'individual-forfeit',
    stake: Number(formatEther(raw.stakeAmount)),
    duration,
    currentDay,
    createdAt: Number(raw.createdAt),
    startTime,
    endTime,
    reviewPeriod: Number(raw.reviewPeriod),
    reviewDeadline: Number(raw.reviewDeadline),
    requiredCheckIns: required,
    creatorCheckIns,
    partnerCheckIns,
    creatorEvidence: mapEvidence(creatorEvidence),
    partnerEvidence: mapEvidence(partnerEvidence),
    start: displayDate(startTime),
    end: displayDate(endTime),
    nextAction,
    activity: [
      `Created ${displayDate(Number(raw.createdAt))}`,
      status === 'waiting'
        ? 'Invitation is waiting for the partner'
        : status === 'cancelled'
          ? 'Invitation was cancelled'
          : `Started ${displayDate(startTime)}`,
      status === 'finalized' ? `Outcome: ${outcome.replaceAll('-', ' ')}` : nextAction,
    ],
  };
}

const soloStatuses: SoloGoalStatus[] = [
  'pending-verifier',
  'active',
  'approved',
  'rejected',
  'cancelled',
  'expired',
];

function mapSoloGoal(
  id: bigint,
  raw: RawSoloGoal,
  evidence: RawEvidence,
): SoloGoal {
  return {
    id: id.toString(),
    owner: raw.owner,
    verifier: raw.verifier,
    failureRecipient: raw.failureRecipient,
    amount: Number(formatEther(raw.amount)),
    createdAt: Number(raw.createdAt),
    acceptedAt: Number(raw.acceptedAt),
    goalDeadline: Number(raw.goalDeadline),
    reviewDeadline: Number(raw.reviewDeadline),
    resolvedAt: Number(raw.resolvedAt),
    goalDuration: Number(raw.goalDuration),
    reviewPeriod: Number(raw.reviewPeriod),
    resolutionDigest: raw.resolutionDigest,
    status: soloStatuses[Number(raw.status)] ?? 'expired',
    title: raw.title,
    evidence: mapEvidence(evidence),
  };
}

async function idsNewestFirst(count: bigint, maximum = 100): Promise<bigint[]> {
  const first = count > BigInt(maximum) ? count - BigInt(maximum) + 1n : 1n;
  const ids: bigint[] = [];
  for (let value = count; value >= first && value > 0n; value -= 1n) {
    ids.push(value);
  }
  return ids;
}

async function readChallenge(
  contract: Contract,
  challengeId: bigint,
): Promise<Pact> {
  const raw = (await contract.challenges(challengeId)) as RawChallenge;
  const emptyEvidence: RawEvidence = {
    digest: ZeroHash,
    uri: '',
    submittedAt: 0n,
    decision: 0n,
  };
  let creatorEvidence = emptyEvidence;
  let partnerEvidence = emptyEvidence;
  if (Number(raw.verificationMode) === 1) {
    [creatorEvidence, partnerEvidence] = (await Promise.all([
      contract.evidenceByParticipant(challengeId, raw.creator),
      contract.evidenceByParticipant(challengeId, raw.partner),
    ])) as [RawEvidence, RawEvidence];
  }
  return mapChallenge(challengeId, raw, creatorEvidence, partnerEvidence);
}

export async function getPacts(): Promise<Pact[]> {
  const contract = readContract();
  const count = (await contract.challengeCount()) as bigint;
  return Promise.all(
    (await idsNewestFirst(count)).map((challengeId) =>
      readChallenge(contract, challengeId),
    ),
  );
}

export async function getPactById(challengeId: string): Promise<Pact> {
  const contract = readContract();
  const raw = (await contract.challenges(BigInt(challengeId))) as RawChallenge;
  if (/^0x0{40}$/i.test(raw.creator)) throw new Error('Pact not found.');
  return readChallenge(contract, BigInt(challengeId));
}

export async function getClaimable(address: string): Promise<number> {
  const value = (await readContract().claimable(address)) as bigint;
  return Number(formatEther(value));
}

export async function getCurrentCheckInState(
  challengeId: string,
  address: string,
): Promise<CheckInState> {
  const contract = readContract();
  try {
    const dayIndex = (await contract.currentDayIndex(
      BigInt(challengeId),
    )) as bigint;
    const checked = (await contract.hasCheckedIn(
      BigInt(challengeId),
      address,
      dayIndex,
    )) as boolean;
    return { dayIndex: Number(dayIndex), checked };
  } catch {
    return { dayIndex: null, checked: false };
  }
}

export async function createPact(
  input: CreatePactInput,
): Promise<ContractTransactionResponse> {
  const value = parseEther(input.stakeBot);
  if (input.mode === 'onchain') {
    return send((contract) =>
      contract.createChallenge(
        input.partner,
        input.failureRecipient,
        input.durationDays,
        input.requiredCheckIns,
        input.title,
        { value },
      ) as Promise<ContractTransactionResponse>,
    );
  }
  return send((contract) =>
    contract.createEvidenceChallenge(
      input.partner,
      input.failureRecipient,
      input.durationDays,
      input.reviewPeriodSeconds,
      input.title,
      { value },
    ) as Promise<ContractTransactionResponse>,
  );
}

export async function joinPact(
  challengeId: string,
  stakeBot: string,
): Promise<ContractTransactionResponse> {
  return send((contract) =>
    contract.joinChallenge(BigInt(challengeId), {
      value: parseEther(stakeBot),
    }) as Promise<ContractTransactionResponse>,
  );
}

export async function withdrawUnjoined(
  challengeId: string,
): Promise<ContractTransactionResponse> {
  return send((contract) =>
    contract.cancelUnjoinedChallenge(
      BigInt(challengeId),
    ) as Promise<ContractTransactionResponse>,
  );
}

export async function checkInOnChain(
  challengeId: string,
): Promise<ContractTransactionResponse> {
  return send((contract) =>
    contract.checkIn(BigInt(challengeId)) as Promise<ContractTransactionResponse>,
  );
}

async function signAndStoreEvidence(
  commitmentType: 'challenge' | 'solo-goal',
  commitmentId: string,
  input: EvidenceInput,
): Promise<{ digest: string; uri: string }> {
  const signer = await getSigner();
  const participantAddress = await signer.getAddress();
  const request = {
    chainId: BOT_CHAIN_CONFIG.chainId,
    contractAddress: requireConfiguredAddress(),
    commitmentType,
    commitmentId,
    participant: participantAddress,
    uri: input.uri.trim(),
    note: input.note?.trim() ?? '',
    issuedAt: Date.now(),
  };
  const prepareResponse = await fetch(
    `${BOT_CHAIN_CONFIG.evidenceApiUrl}/api/evidence/prepare`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
  if (!prepareResponse.ok) {
    throw new Error(
      `Evidence service rejected the proof (${prepareResponse.status}).`,
    );
  }
  const prepared = (await prepareResponse.json()) as {
    evidence: Record<string, unknown>;
    digest: string;
    signingMessage: string;
  };
  const signature = await signer.signMessage(prepared.signingMessage);
  const storeResponse = await fetch(
    `${BOT_CHAIN_CONFIG.evidenceApiUrl}/api/evidence`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...prepared.evidence, signature }),
    },
  );
  if (!storeResponse.ok) {
    throw new Error(
      `Evidence service could not preserve the signed proof (${storeResponse.status}).`,
    );
  }
  return { digest: prepared.digest, uri: input.uri.trim() };
}

export async function submitProof(
  challengeId: string,
  input: EvidenceInput,
): Promise<ContractTransactionResponse> {
  const evidence = await signAndStoreEvidence('challenge', challengeId, input);
  return send((contract) =>
    contract.submitEvidence(
      BigInt(challengeId),
      evidence.digest,
      evidence.uri,
    ) as Promise<ContractTransactionResponse>,
  );
}

export async function reviewProof(
  challengeId: string,
  participantAddress: string,
  approved: boolean,
): Promise<ContractTransactionResponse> {
  return send((contract) =>
    contract.reviewEvidence(
      BigInt(challengeId),
      participantAddress,
      approved,
    ) as Promise<ContractTransactionResponse>,
  );
}

export async function finalizePact(
  challengeId: string,
): Promise<ContractTransactionResponse> {
  return send((contract) =>
    contract.finalizeChallenge(
      BigInt(challengeId),
    ) as Promise<ContractTransactionResponse>,
  );
}

export async function withdrawReward(): Promise<ContractTransactionResponse> {
  return send((contract) =>
    contract.withdrawPayout() as Promise<ContractTransactionResponse>,
  );
}

export async function getSoloGoals(): Promise<SoloGoal[]> {
  const contract = readContract();
  const count = (await contract.soloGoalCount()) as bigint;
  return Promise.all(
    (await idsNewestFirst(count)).map(async (soloGoalId) => {
      const [goal, evidence] = (await Promise.all([
        contract.soloGoals(soloGoalId),
        contract.soloGoalEvidence(soloGoalId),
      ])) as [RawSoloGoal, RawEvidence];
      return mapSoloGoal(soloGoalId, goal, evidence);
    }),
  );
}

export async function getSoloGoalById(soloGoalId: string): Promise<SoloGoal> {
  const contract = readContract();
  const [goal, evidence] = (await Promise.all([
    contract.soloGoals(BigInt(soloGoalId)),
    contract.soloGoalEvidence(BigInt(soloGoalId)),
  ])) as [RawSoloGoal, RawEvidence];
  if (/^0x0{40}$/i.test(goal.owner)) throw new Error('Solo goal not found.');
  return mapSoloGoal(BigInt(soloGoalId), goal, evidence);
}

export async function createSoloGoal(
  input: CreateSoloGoalInput,
): Promise<ContractTransactionResponse> {
  return send((contract) =>
    contract.createSoloGoal(
      input.verifier,
      input.failureRecipient,
      input.goalDurationSeconds,
      input.reviewPeriodSeconds,
      input.title,
      { value: parseEther(input.stakeBot) },
    ) as Promise<ContractTransactionResponse>,
  );
}

export async function acceptSoloGoal(
  soloGoalId: string,
): Promise<ContractTransactionResponse> {
  return send((contract) =>
    contract.acceptSoloGoal(
      BigInt(soloGoalId),
    ) as Promise<ContractTransactionResponse>,
  );
}

export async function cancelPendingSoloGoal(
  soloGoalId: string,
): Promise<ContractTransactionResponse> {
  return send((contract) =>
    contract.cancelPendingSoloGoal(
      BigInt(soloGoalId),
    ) as Promise<ContractTransactionResponse>,
  );
}

export async function submitSoloGoalProof(
  soloGoalId: string,
  input: EvidenceInput,
): Promise<ContractTransactionResponse> {
  const evidence = await signAndStoreEvidence('solo-goal', soloGoalId, input);
  return send((contract) =>
    contract.submitSoloGoalEvidence(
      BigInt(soloGoalId),
      evidence.digest,
      evidence.uri,
    ) as Promise<ContractTransactionResponse>,
  );
}

export async function approveSoloGoal(
  soloGoalId: string,
): Promise<ContractTransactionResponse> {
  return send((contract) =>
    contract.approveSoloGoal(
      BigInt(soloGoalId),
    ) as Promise<ContractTransactionResponse>,
  );
}

export async function rejectSoloGoal(
  soloGoalId: string,
  reason: string,
): Promise<ContractTransactionResponse> {
  return send((contract) =>
    contract.rejectSoloGoal(
      BigInt(soloGoalId),
      hashText(reason.trim() || 'Goal requirements not met'),
    ) as Promise<ContractTransactionResponse>,
  );
}

export async function finalizeExpiredSoloGoal(
  soloGoalId: string,
): Promise<ContractTransactionResponse> {
  return send((contract) =>
    contract.finalizeExpiredSoloGoal(
      BigInt(soloGoalId),
    ) as Promise<ContractTransactionResponse>,
  );
}

export function transactionUrl(hash: string): string {
  return `${BOT_CHAIN_CONFIG.explorerUrl}/tx/${hash}`;
}

export function addressUrl(address: string): string {
  return `${BOT_CHAIN_CONFIG.explorerUrl}/address/${address}`;
}
