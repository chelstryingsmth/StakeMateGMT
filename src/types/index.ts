export type VerificationMode = 'onchain' | 'peer';
export type PactStatus = 'waiting' | 'active' | 'completed' | 'ended' | 'finalized';
export type CheckInStatus = 'passed' | 'failed' | 'pending' | 'review' | 'not-started';
export type TransactionStatus = 'ready' | 'wallet' | 'processing' | 'success' | 'rejected';
export interface WalletState { address: string | null; connected: boolean; network: 'BOT Chain' | 'Wrong network'; balance: number; }
export interface Participant { address: string; name: string; avatar: string; passed: number; failed: number; pending: number; streak: number; }
export interface CheckIn { day: number; date: string; status: CheckInStatus; participant: 'you' | 'partner'; proofUrl?: string; tx?: string; resolution: string; }
export interface ProofSubmission { submitter: string; day: number; url: string; note: string; submittedAt: string; reviewDeadline: string; status: 'awaiting'|'approved'|'rejected'|'auto-approved'|'expired'; }
export interface PactResult { yours: { passed:number; failed:number; payout:number }; partner: { passed:number; failed:number; payout:number }; finalized: boolean; }
export interface Pact { id:string; title:string; description:string; partner:Participant; you:Participant; mode:VerificationMode; status:PactStatus; stake:number; duration:number; currentDay:number; start:string; end:string; nextAction:string; activity:string[]; checks:CheckIn[]; result?:PactResult; }
