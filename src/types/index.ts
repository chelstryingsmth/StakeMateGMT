export type VerificationMode = 'onchain' | 'peer';
export type PactStatus = 'waiting' | 'active' | 'finalized' | 'cancelled';
export type PactOutcome =
  | 'pending'
  | 'both-succeeded'
  | 'creator-succeeded'
  | 'partner-succeeded'
  | 'both-failed';
export type ReviewDecision = 'none' | 'pending' | 'approved' | 'rejected';

export interface WalletState {
  address: string | null;
  connected: boolean;
  network: 'BOT Chain' | 'Wrong network';
  balance: number;
  chainId: number | null;
}

export interface Participant {
  address: string;
  name: string;
  avatar: string;
  passed: number;
  failed: number;
  pending: number;
  streak: number;
}

export interface Evidence {
  digest: string;
  uri: string;
  submittedAt: number;
  decision: ReviewDecision;
}

export interface Pact {
  id: string;
  title: string;
  description: string;
  creator: string;
  partnerAddress: string;
  forfeitureRecipient: string;
  partner: Participant;
  you: Participant;
  mode: VerificationMode;
  status: PactStatus;
  outcome: PactOutcome;
  payoutMode: 'winner-takes-pool' | 'individual-forfeit';
  stake: number;
  duration: number;
  currentDay: number;
  createdAt: number;
  startTime: number;
  endTime: number;
  reviewPeriod: number;
  reviewDeadline: number;
  requiredCheckIns: number;
  creatorCheckIns: number;
  partnerCheckIns: number;
  creatorEvidence: Evidence;
  partnerEvidence: Evidence;
  start: string;
  end: string;
  nextAction: string;
  activity: string[];
}

export type SoloGoalStatus =
  | 'pending-verifier'
  | 'active'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export interface SoloGoal {
  id: string;
  owner: string;
  verifier: string;
  failureRecipient: string;
  amount: number;
  createdAt: number;
  acceptedAt: number;
  goalDeadline: number;
  reviewDeadline: number;
  resolvedAt: number;
  goalDuration: number;
  reviewPeriod: number;
  resolutionDigest: string;
  status: SoloGoalStatus;
  title: string;
  evidence: Evidence;
}

export interface CreateSoloGoalInput {
  verifier: string;
  failureRecipient: string;
  goalDurationSeconds: number;
  reviewPeriodSeconds: number;
  title: string;
  stakeBot: string;
}
