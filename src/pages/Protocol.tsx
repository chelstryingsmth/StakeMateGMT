import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { isAddress, type ContractTransactionResponse } from 'ethers';
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  Copy,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { BOT_CHAIN_CONFIG, isContractConfigured } from '../config/blockchain';
import { usePacts, useSoloGoals } from '../hooks/usePacts';
import { useWallet } from '../hooks/useWallet';
import {
  acceptSoloGoal,
  addressUrl,
  approveSoloGoal,
  cancelPendingSoloGoal,
  checkInOnChain,
  createPact,
  createSoloGoal,
  finalizeExpiredSoloGoal,
  finalizePact,
  friendlyContractError,
  getClaimable,
  getCurrentCheckInState,
  getPacts,
  joinPact,
  rejectSoloGoal,
  reviewProof,
  submitProof,
  submitSoloGoalProof,
  transactionUrl,
  withdrawReward,
  withdrawUnjoined,
} from '../services/pactService';
import type {
  Evidence,
  Pact,
  PactStatus,
  SoloGoal,
  VerificationMode,
} from '../types';

type Action = () => Promise<unknown>;
type Feedback = {
  kind: 'error' | 'success';
  text: string;
  transactionHash?: string;
};

const sameAddress = (left?: string | null, right?: string | null) =>
  Boolean(left && right && left.toLowerCase() === right.toLowerCase());

const normalizeAddress = (address: string) => address.trim().toLowerCase();

const isCompatibleAddress = (address: string) =>
  isAddress(normalizeAddress(address));

const shortAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

const dateTime = (seconds: number, fallback = 'Not started') =>
  seconds ? new Date(seconds * 1_000).toLocaleString() : fallback;

const durationCopy = (seconds: number) => {
  if (seconds < 86_400) return `${Math.round(seconds / 3_600)} hours`;
  return `${Math.round(seconds / 86_400)} days`;
};

const validProofUri = (value: string) =>
  /^(https:\/\/|ipfs:\/\/|ar:\/\/)/i.test(value.trim());

const getHash = (value: unknown) =>
  (value as ContractTransactionResponse | undefined)?.hash;

function Panel({
  eyebrow,
  title,
  copy,
  children,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  children: ReactNode;
}) {
  return (
    <section className="protocol-panel">
      <div className="protocol-panel-head">
        <span className="section-kicker">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      {children}
    </section>
  );
}

function Message({
  kind,
  children,
  transactionHash,
}: {
  kind: 'error' | 'success' | 'info';
  children: ReactNode;
  transactionHash?: string;
}) {
  return (
    <div className={`protocol-message ${kind}`}>
      {kind === 'error' ? (
        <XCircle />
      ) : kind === 'success' ? (
        <CheckCircle2 />
      ) : (
        <CircleAlert />
      )}
      <span>
        {children}
        {transactionHash && (
          <>
            {' '}
            <a
              href={transactionUrl(transactionHash)}
              target="_blank"
              rel="noreferrer"
            >
              View transaction <ExternalLink size={13} />
            </a>
          </>
        )}
      </span>
    </div>
  );
}

function PendingWalletNotice({ label }: { label: string | null }) {
  if (!label) return null;

  return (
    <div className="protocol-message info">
      <LoaderCircle className="spin" />
      <span>
        Waiting for wallet signature: <b>{label}</b>. Confirm the request in your wallet to continue.
      </span>
    </div>
  );
}

function useProtocolAction(refresh: () => Promise<void>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Feedback | null>(null);

  const run = async (name: string, action: Action) => {
    setBusy(name);
    setMessage(null);
    try {
      const result = await action();
      setMessage({
        kind: 'success',
        text: `${name} confirmed on ${BOT_CHAIN_CONFIG.chainName}.`,
        transactionHash: getHash(result),
      });
      await refresh();
      return true;
    } catch (reason) {
      setMessage({
        kind: 'error',
        text: friendlyContractError(reason),
      });
      return false;
    } finally {
      setBusy(null);
    }
  };

  return { busy, message, setMessage, run };
}

function ConnectGate({ evidenceOnline }: { evidenceOnline: boolean | null }) {
  const wallet = useWallet();
  return (
    <div className="connect-gate">
      <div>
        <Wallet />
        <span>
          <b>
            {wallet.connected ? shortAddress(wallet.address!) : 'Wallet required'}
          </b>
          <small>
            {wallet.connected
              ? `${wallet.balance.toFixed(4)} BOT · ${wallet.network}`
              : 'Connect MetaMask or BO Wallet on BOT Chain Testnet'}
          </small>
        </span>
      </div>
      <div className="service-state">
        <i className={evidenceOnline ? 'online' : ''} />
        Evidence service{' '}
        {evidenceOnline === null
          ? 'checking'
          : evidenceOnline
            ? 'online'
            : 'offline'}
      </div>
      <div className="button-row">
        {wallet.connected && (
          <button
            className="btn ghost small"
            onClick={() => void wallet.refresh().catch(() => undefined)}
          >
            <RefreshCw /> Refresh
          </button>
        )}
        {(!wallet.connected || wallet.network === 'Wrong network') && (
          <button
            className="btn primary"
            disabled={wallet.connecting}
            onClick={() => void wallet.connect().catch(() => undefined)}
          >
            {wallet.connecting ? <LoaderCircle className="spin" /> : <Wallet />}
            {wallet.connecting
              ? 'Connecting'
              : wallet.connected
                ? 'Switch network'
                : 'Connect wallet'}
          </button>
        )}
      </div>
      {wallet.error && <small className="error-text">{wallet.error}</small>}
    </div>
  );
}

function AddressLink({
  address,
  label,
}: {
  address: string;
  label?: string;
}) {
  return (
    <a
      className="address-link"
      href={addressUrl(address)}
      target="_blank"
      rel="noreferrer"
      title={address}
    >
      {label ?? shortAddress(address)} <ExternalLink size={12} />
    </a>
  );
}

function CreateSoloGoal({ afterCreate }: { afterCreate: () => Promise<void> }) {
  const wallet = useWallet();
  const [title, setTitle] = useState('');
  const [verifier, setVerifier] = useState('');
  const [failureRecipient, setFailureRecipient] = useState('');
  const [stake, setStake] = useState('1');
  const [durationDays, setDurationDays] = useState('14');
  const [reviewHours, setReviewHours] = useState('24');
  const { busy, message, run } = useProtocolAction(afterCreate);

  const addressesValid =
    isCompatibleAddress(verifier) &&
    isCompatibleAddress(failureRecipient) &&
    !sameAddress(verifier, failureRecipient) &&
    !sameAddress(wallet.address, verifier) &&
    !sameAddress(wallet.address, failureRecipient);
  const amountsValid =
    Number(stake) > 0 &&
    Number(durationDays) >= 1 / 24 &&
    Number(durationDays) <= 365 &&
    Number(reviewHours) >= 1 &&
    Number(reviewHours) <= 168;
  const formValid = Boolean(title.trim()) && addressesValid && amountsValid;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!wallet.connected || wallet.network !== 'BOT Chain') {
      await wallet.connect().catch(() => undefined);
      return;
    }
    if (!formValid) return;
    const created = await run('Solo goal created', () =>
      createSoloGoal({
        verifier: normalizeAddress(verifier),
        failureRecipient: normalizeAddress(failureRecipient),
        title: title.trim(),
        stakeBot: stake,
        goalDurationSeconds: Math.round(Number(durationDays) * 86_400),
        reviewPeriodSeconds: Math.round(Number(reviewHours) * 3_600),
      }),
    );
    if (created) setTitle('');
  };

  return (
    <form className="protocol-form" onSubmit={(event) => void submit(event)}>
      <label className="field span-2">
        <span>Goal</span>
        <input
          value={title}
          maxLength={100}
          placeholder="Complete my 14-day study sprint"
          required
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Verifier friend address</span>
        <input
          value={verifier}
          placeholder="0x..."
          required
          onChange={(event) => setVerifier(event.target.value.trim())}
        />
      </label>
      <label className="field">
        <span>Neutral failure recipient</span>
        <input
          value={failureRecipient}
          placeholder="0x... charity or team treasury"
          required
          onChange={(event) => setFailureRecipient(event.target.value.trim())}
        />
      </label>
      <label className="field">
        <span>BOT to lock</span>
        <input
          value={stake}
          type="number"
          min="0.000001"
          step="any"
          required
          onChange={(event) => setStake(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Goal duration (days)</span>
        <input
          value={durationDays}
          type="number"
          min={1 / 24}
          max="365"
          step="any"
          required
          onChange={(event) => setDurationDays(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Friend review window (hours)</span>
        <input
          value={reviewHours}
          type="number"
          min="1"
          max="168"
          required
          onChange={(event) => setReviewHours(event.target.value)}
        />
      </label>
      <div className="protocol-form-note span-2">
        <ShieldCheck />
        <span>
          Use three separate wallets: owner, verifier, and neutral recipient.
          Rejected or ignored goals go to the neutral recipient—not the verifier.
        </span>
      </div>
      {(verifier || failureRecipient) && !addressesValid && (
        <small className="error-text span-2">
          Enter two valid, different addresses that are also different from your
          connected wallet.
        </small>
      )}
      {busy && <PendingWalletNotice label={busy} />}
      <button
        className="btn primary span-2"
        disabled={Boolean(busy) || !formValid}
      >
        {busy ? <LoaderCircle className="spin" /> : <LockKeyhole />}
        Create goal and lock BOT
      </button>
      {message && (
        <div className="span-2">
          <Message
            kind={message.kind}
            transactionHash={message.transactionHash}
          >
            {message.text}
          </Message>
        </div>
      )}
    </form>
  );
}

function CreateTwoPersonPact({
  afterCreate,
}: {
  afterCreate: () => Promise<void>;
}) {
  const wallet = useWallet();
  const [mode, setMode] = useState<VerificationMode>('onchain');
  const [title, setTitle] = useState('');
  const [partner, setPartner] = useState('');
  const [failureRecipient, setFailureRecipient] = useState('');
  const [stake, setStake] = useState('1');
  const [duration, setDuration] = useState('30');
  const [required, setRequired] = useState('25');
  const [reviewHours, setReviewHours] = useState('24');
  const { busy, message, run } = useProtocolAction(afterCreate);

  const addressesValid =
    isCompatibleAddress(partner) &&
    isCompatibleAddress(failureRecipient) &&
    !sameAddress(partner, failureRecipient) &&
    !sameAddress(wallet.address, partner) &&
    !sameAddress(wallet.address, failureRecipient);
  const durationNumber = Number(duration);
  const rulesValid =
    Number(stake) > 0 &&
    Number.isInteger(durationNumber) &&
    durationNumber >= 1 &&
    durationNumber <= 365 &&
    (mode === 'onchain'
      ? Number.isInteger(Number(required)) &&
        Number(required) >= 1 &&
        Number(required) <= durationNumber
      : Number(reviewHours) >= 1 && Number(reviewHours) <= 168);
  const formValid = Boolean(title.trim()) && addressesValid && rulesValid;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!wallet.connected || wallet.network !== 'BOT Chain') {
      await wallet.connect().catch(() => undefined);
      return;
    }
    if (!formValid) return;
    const created = await run('Pact created', () =>
      createPact({
        partner: normalizeAddress(partner),
        failureRecipient: normalizeAddress(failureRecipient),
        durationDays: durationNumber,
        requiredCheckIns: Number(required),
        reviewPeriodSeconds: Number(reviewHours) * 3_600,
        title: title.trim(),
        stakeBot: stake,
        mode,
      }),
    );
    if (created) setTitle('');
  };

  return (
    <form className="protocol-form" onSubmit={(event) => void submit(event)}>
      <div className="protocol-toggle span-2">
        <button
          type="button"
          className={mode === 'onchain' ? 'selected' : ''}
          onClick={() => setMode('onchain')}
        >
          <CheckCircle2 /> Daily on-chain check-ins
        </button>
        <button
          type="button"
          className={mode === 'peer' ? 'selected' : ''}
          onClick={() => setMode('peer')}
        >
          <Users /> Final partner-reviewed proof
        </button>
      </div>
      <label className="field span-2">
        <span>Pact</span>
        <input
          value={title}
          maxLength={100}
          placeholder="30-day coding commitment"
          required
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Partner address</span>
        <input
          value={partner}
          placeholder="0x..."
          required
          onChange={(event) => setPartner(event.target.value.trim())}
        />
      </label>
      <label className="field">
        <span>Neutral failure recipient</span>
        <input
          value={failureRecipient}
          placeholder="0x... charity or team treasury"
          required
          onChange={(event) => setFailureRecipient(event.target.value.trim())}
        />
      </label>
      <label className="field">
        <span>BOT per person</span>
        <input
          value={stake}
          type="number"
          min="0.000001"
          step="any"
          required
          onChange={(event) => setStake(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Duration (whole days)</span>
        <input
          value={duration}
          type="number"
          min="1"
          max="365"
          step="1"
          required
          onChange={(event) => setDuration(event.target.value)}
        />
      </label>
      {mode === 'onchain' ? (
        <label className="field">
          <span>Required check-ins per person</span>
          <input
            value={required}
            type="number"
            min="1"
            max={duration}
            step="1"
            required
            onChange={(event) => setRequired(event.target.value)}
          />
        </label>
      ) : (
        <label className="field">
          <span>Evidence review window (hours)</span>
          <input
            value={reviewHours}
            type="number"
            min="1"
            max="168"
            required
            onChange={(event) => setReviewHours(event.target.value)}
          />
        </label>
      )}
      <div className="protocol-form-note span-2">
        <ShieldCheck />
        <span>
          The partner must join with exactly {stake || '0'} BOT. Failed stakes
          settle to the independent neutral recipient.
        </span>
      </div>
      {(partner || failureRecipient) && !addressesValid && (
        <small className="error-text span-2">
          Partner, creator, and neutral recipient must be three different valid
          addresses.
        </small>
      )}
      {busy && <PendingWalletNotice label={busy} />}
      <button
        className="btn primary span-2"
        disabled={Boolean(busy) || !formValid}
      >
        {busy ? <LoaderCircle className="spin" /> : <Users />}
        Create pact and lock BOT
      </button>
      {message && (
        <div className="span-2">
          <Message
            kind={message.kind}
            transactionHash={message.transactionHash}
          >
            {message.text}
          </Message>
        </div>
      )}
    </form>
  );
}

function EvidenceView({
  evidence,
  label,
}: {
  evidence: Evidence;
  label: string;
}) {
  if (!evidence.uri) return null;
  return (
    <div className="evidence-view">
      <span>
        <FileCheck2 />
        <b>{label}</b>
        <small>{evidence.decision}</small>
      </span>
      <a href={evidence.uri} target="_blank" rel="noreferrer">
        Open proof <ExternalLink size={13} />
      </a>
    </div>
  );
}

function SoloGoalCard({
  goal,
  address,
  refresh,
}: {
  goal: SoloGoal;
  address: string | null;
  refresh: () => Promise<void>;
}) {
  const [uri, setUri] = useState('');
  const [note, setNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const { busy, message, run } = useProtocolAction(refresh);
  const owner = sameAddress(address, goal.owner);
  const verifier = sameAddress(address, goal.verifier);
  const neutral = sameAddress(address, goal.failureRecipient);
  const now = Date.now() / 1_000;
  const canSubmit =
    owner && goal.status === 'active' && now < goal.goalDeadline;
  const canReview =
    verifier &&
    goal.status === 'active' &&
    now >= goal.goalDeadline &&
    now <= goal.reviewDeadline;
  const canExpire =
    goal.status === 'active' &&
    goal.reviewDeadline > 0 &&
    now > goal.reviewDeadline;

  let role = 'Public record';
  if (owner) role = 'You are the owner';
  if (verifier) role = 'You are the verifier';
  if (neutral) role = 'You are the neutral recipient';

  return (
    <article className="protocol-card">
      <div className="protocol-card-head">
        <span className={`badge ${goal.status}`}>
          {goal.status.replace('-', ' ')}
        </span>
        <span>
          {role} · Goal #{goal.id}
        </span>
      </div>
      <h3>{goal.title}</h3>
      <div className="protocol-facts">
        <span>
          <b>{goal.amount} BOT</b> locked
        </span>
        <span>
          <b>
            <AddressLink address={goal.owner} />
          </b>{' '}
          owner
        </span>
        <span>
          <b>
            <AddressLink address={goal.verifier} />
          </b>{' '}
          verifier
        </span>
        <span>
          <b>{dateTime(goal.goalDeadline, 'After verifier accepts')}</b> goal
          deadline
        </span>
        <span>
          <b>{durationCopy(goal.reviewPeriod)}</b> review window
        </span>
        <span>
          <b>
            <AddressLink address={goal.failureRecipient} />
          </b>{' '}
          neutral recipient
        </span>
      </div>

      <EvidenceView evidence={goal.evidence} label="Owner’s signed proof" />

      {canSubmit && (
        <div className="evidence-entry">
          <input
            value={uri}
            placeholder="https:// or ipfs:// public proof"
            onChange={(event) => setUri(event.target.value)}
          />
          <input
            value={note}
            maxLength={500}
            placeholder="Optional signed note"
            onChange={(event) => setNote(event.target.value)}
          />
          <button
            className="btn secondary"
            disabled={!validProofUri(uri) || Boolean(busy)}
            onClick={() =>
              void run('Solo goal evidence submitted', () =>
                submitSoloGoalProof(goal.id, { uri, note }),
              )
            }
          >
            <FileCheck2 /> Sign and submit proof
          </button>
        </div>
      )}

      {canReview && (
        <label className="field review-reason">
          <span>Reason if rejecting</span>
          <input
            value={rejectionReason}
            maxLength={200}
            placeholder="Describe which agreed requirement was not met"
            onChange={(event) => setRejectionReason(event.target.value)}
          />
        </label>
      )}

      {busy && <PendingWalletNotice label={busy} />}
      <div className="protocol-actions">
        {verifier && goal.status === 'pending-verifier' && (
          <button
            className="btn primary"
            disabled={Boolean(busy)}
            onClick={() =>
              void run('Goal accepted', () => acceptSoloGoal(goal.id))
            }
          >
            <UserRoundCheck /> Accept verifier role
          </button>
        )}
        {owner && goal.status === 'pending-verifier' && (
          <button
            className="btn danger"
            disabled={Boolean(busy)}
            onClick={() =>
              void run('Goal cancelled', () => cancelPendingSoloGoal(goal.id))
            }
          >
            Cancel goal and credit refund
          </button>
        )}
        {canReview && (
          <>
            <button
              className="btn primary"
              disabled={!goal.evidence.uri || Boolean(busy)}
              onClick={() =>
                void run('Goal approved', () => approveSoloGoal(goal.id))
              }
            >
              Approve and release BOT
            </button>
            <button
              className="btn danger"
              disabled={!rejectionReason.trim() || Boolean(busy)}
              onClick={() =>
                void run('Goal rejected', () =>
                  rejectSoloGoal(goal.id, rejectionReason),
                )
              }
            >
              Reject to neutral recipient
            </button>
          </>
        )}
        {canExpire && (
          <button
            className="btn secondary"
            disabled={Boolean(busy)}
            onClick={() =>
              void run('Expired goal finalized', () =>
                finalizeExpiredSoloGoal(goal.id),
              )
            }
          >
            Finalize ignored review
          </button>
        )}
      </div>

      {goal.status === 'active' && !canSubmit && !canReview && !canExpire && (
        <p className="next-action">
          <Clock3 /> Waiting for the goal deadline on{' '}
          {dateTime(goal.goalDeadline)}.
        </p>
      )}
      {message && (
        <Message
          kind={message.kind}
          transactionHash={message.transactionHash}
        >
          {message.text}
        </Message>
      )}
    </article>
  );
}

function PactCard({
  pact,
  address,
  refresh,
}: {
  pact: Pact;
  address: string | null;
  refresh: () => Promise<void>;
}) {
  const [uri, setUri] = useState('');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [checkInState, setCheckInState] = useState<{
    dayIndex: number | null;
    checked: boolean;
  }>({ dayIndex: null, checked: false });
  const { busy, message, run } = useProtocolAction(refresh);
  const creator = sameAddress(address, pact.creator);
  const partner = sameAddress(address, pact.partnerAddress);
  const participant = creator || partner;
  const now = Date.now() / 1_000;
  const beforeEnd = pact.endTime > 0 && now < pact.endTime;
  const inReviewWindow =
    pact.mode === 'peer' &&
    pact.status === 'active' &&
    now >= pact.endTime &&
    now <= pact.reviewDeadline;
  const ownEvidence = creator ? pact.creatorEvidence : pact.partnerEvidence;
  const otherEvidence = creator ? pact.partnerEvidence : pact.creatorEvidence;
  const otherAddress = creator ? pact.partnerAddress : pact.creator;
  const allEvidenceResolved = [pact.creatorEvidence, pact.partnerEvidence].every(
    (evidence) => evidence.decision === 'none' || evidence.decision !== 'pending',
  );
  const canFinalize =
    pact.status === 'active' &&
    now >= pact.endTime &&
    (pact.mode === 'onchain' ||
      now >= pact.reviewDeadline ||
      allEvidenceResolved);

  useEffect(() => {
    let active = true;
    if (
      !address ||
      !participant ||
      pact.status !== 'active' ||
      pact.mode !== 'onchain' ||
      !beforeEnd
    ) {
      setCheckInState({ dayIndex: null, checked: false });
      return;
    }
    void getCurrentCheckInState(pact.id, address).then((state) => {
      if (active) setCheckInState(state);
    });
    return () => {
      active = false;
    };
  }, [
    address,
    beforeEnd,
    pact.creatorCheckIns,
    pact.id,
    pact.mode,
    pact.partnerCheckIns,
    pact.status,
    participant,
  ]);

  let role = 'Public record';
  if (creator) role = 'You are the creator';
  if (partner) role = 'You are the invited partner';

  const copyInvite = async () => {
    const url = `${window.location.origin}/app?pact=${pact.id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <article className="protocol-card">
      <div className="protocol-card-head">
        <span className={`badge ${pact.status}`}>{pact.status}</span>
        <span>
          {role} · Pact #{pact.id}
        </span>
      </div>
      <h3>{pact.title}</h3>
      <p>{pact.description}</p>
      <div className="protocol-facts">
        <span>
          <b>{pact.stake} BOT</b> each
        </span>
        <span>
          <b>{pact.duration} days</b> duration
        </span>
        <span>
          <b>{pact.mode === 'onchain' ? 'Daily check-in' : 'Partner proof'}</b>{' '}
          verification
        </span>
        <span>
          <b>
            <AddressLink address={pact.creator} />
          </b>{' '}
          creator
        </span>
        <span>
          <b>
            <AddressLink address={pact.partnerAddress} />
          </b>{' '}
          partner
        </span>
        <span>
          <b>
            <AddressLink address={pact.forfeitureRecipient} />
          </b>{' '}
          neutral recipient
        </span>
        {pact.status !== 'waiting' && (
          <span>
            <b>{dateTime(pact.endTime)}</b> deadline
          </span>
        )}
        {pact.mode === 'onchain' && (
          <span>
            <b>
              {pact.creatorCheckIns}/{pact.requiredCheckIns} creator ·{' '}
              {pact.partnerCheckIns}/{pact.requiredCheckIns} partner
            </b>{' '}
            check-ins
          </span>
        )}
        {pact.status === 'finalized' && (
          <span>
            <b>{pact.outcome.replaceAll('-', ' ')}</b> outcome
          </span>
        )}
      </div>

      {pact.mode === 'peer' && (
        <div className="evidence-list">
          <EvidenceView
            evidence={pact.creatorEvidence}
            label="Creator’s proof"
          />
          <EvidenceView
            evidence={pact.partnerEvidence}
            label="Partner’s proof"
          />
        </div>
      )}

      {participant &&
        pact.status === 'active' &&
        pact.mode === 'peer' &&
        beforeEnd && (
          <div className="evidence-entry">
            <input
              value={uri}
              placeholder="https:// or ipfs:// public proof"
              onChange={(event) => setUri(event.target.value)}
            />
            <input
              value={note}
              maxLength={500}
              placeholder="Optional signed note"
              onChange={(event) => setNote(event.target.value)}
            />
            <button
              className="btn secondary"
              disabled={!validProofUri(uri) || Boolean(busy)}
              onClick={() =>
                void run(
                  ownEvidence.uri ? 'Evidence replaced' : 'Evidence submitted',
                  () => submitProof(pact.id, { uri, note }),
                )
              }
            >
              <FileCheck2 /> {ownEvidence.uri ? 'Replace' : 'Sign and submit'} proof
            </button>
          </div>
        )}

      {busy && <PendingWalletNotice label={busy} />}
      <div className="protocol-actions">
        {pact.status === 'waiting' && (
          <button
            className="btn secondary"
            onClick={() => void copyInvite().catch(() => undefined)}
          >
            <Copy /> {copied ? 'Invite link copied' : 'Copy invite link'}
          </button>
        )}
        {partner && pact.status === 'waiting' && (
          <button
            className="btn primary"
            disabled={Boolean(busy)}
            onClick={() =>
              void run('Pact joined', () =>
                joinPact(pact.id, pact.stake.toString()),
              )
            }
          >
            Join and match {pact.stake} BOT
          </button>
        )}
        {creator && pact.status === 'waiting' && (
          <button
            className="btn danger"
            disabled={Boolean(busy)}
            onClick={() =>
              void run('Invitation cancelled', () => withdrawUnjoined(pact.id))
            }
          >
            Cancel and credit refund
          </button>
        )}
        {participant &&
          pact.status === 'active' &&
          pact.mode === 'onchain' &&
          beforeEnd && (
            <button
              className="btn primary"
              disabled={Boolean(busy) || checkInState.checked}
              onClick={() =>
                void run('Daily check-in', () =>
                  checkInOnChain(pact.id),
                ).then(() =>
                  address
                    ? getCurrentCheckInState(pact.id, address).then(
                        setCheckInState,
                      )
                    : undefined,
                )
              }
            >
              <CheckCircle2 />
              {checkInState.checked
                ? `Checked in for day ${(checkInState.dayIndex ?? 0) + 1}`
                : 'Check in today'}
            </button>
          )}
        {participant &&
          inReviewWindow &&
          otherEvidence.uri &&
          otherEvidence.decision === 'pending' && (
            <>
              <button
                className="btn primary"
                disabled={Boolean(busy)}
                onClick={() =>
                  void run('Evidence approved', () =>
                    reviewProof(pact.id, otherAddress, true),
                  )
                }
              >
                Approve partner evidence
              </button>
              <button
                className="btn danger"
                disabled={Boolean(busy)}
                onClick={() =>
                  void run('Evidence rejected', () =>
                    reviewProof(pact.id, otherAddress, false),
                  )
                }
              >
                Reject partner evidence
              </button>
            </>
          )}
        {canFinalize && (
          <button
            className="btn secondary"
            disabled={Boolean(busy)}
            onClick={() =>
              void run('Pact finalized', () => finalizePact(pact.id))
            }
          >
            Finalize on-chain result
          </button>
        )}
      </div>

      {pact.status === 'active' && (
        <p className="next-action">
          <Clock3 /> {pact.nextAction}
          {pact.mode === 'peer' && pact.reviewDeadline
            ? ` · Review closes ${dateTime(pact.reviewDeadline)}`
            : ''}
        </p>
      )}
      {message && (
        <Message
          kind={message.kind}
          transactionHash={message.transactionHash}
        >
          {message.text}
        </Message>
      )}
    </article>
  );
}

export default function Protocol() {
  const wallet = useWallet();
  const pacts = usePacts();
  const solo = useSoloGoals();
  const [tab, setTab] = useState<'solo' | 'pact'>('solo');
  const [filter, setFilter] = useState<'all' | PactStatus>('all');
  const [claimable, setClaimable] = useState(0);
  const [claimLoading, setClaimLoading] = useState(false);
  const [evidenceOnline, setEvidenceOnline] = useState<boolean | null>(null);

  const waitForPropagation = (ms: number) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, ms));

  const refreshSharedPacts = async () => {
    setFilter('all');
    const previousRelevantCount = relevantPacts.length;
    const previousTotalCount = pacts.pacts.length;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await Promise.allSettled([pacts.refresh(), solo.refresh()]);
      const nextWallet = await wallet.refresh();
      await refreshClaimable(nextWallet.address);

      try {
        const latestPacts = await getPacts();
        const latestRelevantCount = latestPacts.filter(
          (pact) =>
            sameAddress(wallet.address, pact.creator) ||
            sameAddress(wallet.address, pact.partnerAddress) ||
            sameAddress(wallet.address, pact.forfeitureRecipient),
        ).length;

        if (
          latestRelevantCount > previousRelevantCount ||
          latestPacts.length > previousTotalCount
        ) {
          return;
        }
      } catch {
        // Ignore transient read failures and try again.
      }

      if (attempt < 3) {
        await waitForPropagation(700);
      }
    }

    await refresh();
  };

  const refreshClaimable = async (
    address = wallet.address,
    previousClaimable?: number,
  ) => {
    if (!address) {
      setClaimable(0);
      return 0;
    }

    setClaimLoading(true);
    try {
      let latestClaimable = previousClaimable ?? 0;

      for (let attempt = 0; attempt < 4; attempt += 1) {
        latestClaimable = await getClaimable(address);
        if (
          typeof previousClaimable !== 'number' ||
          latestClaimable !== previousClaimable ||
          attempt === 3
        ) {
          break;
        }
        await waitForPropagation(700);
      }

      setClaimable(latestClaimable);
      return latestClaimable;
    } finally {
      setClaimLoading(false);
    }
  };

  const refresh = async () => {
    const previousClaimable = claimable;
    await Promise.allSettled([pacts.refresh(), solo.refresh()]);
    const nextWallet = await wallet.refresh();
    await refreshClaimable(nextWallet.address, previousClaimable);
  };
  const { busy, message, run } = useProtocolAction(refresh);

  useEffect(() => {
    void refreshClaimable(wallet.address).catch(() => undefined);
    // The connected address is the only dependency needed for this read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address]);

  useEffect(() => {
    let active = true;
    void fetch(`${BOT_CHAIN_CONFIG.evidenceApiUrl}/health`)
      .then((response) => {
        if (active) setEvidenceOnline(response.ok);
      })
      .catch(() => {
        if (active) setEvidenceOnline(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const relevantGoals = useMemo(
    () =>
      wallet.address
        ? solo.goals.filter(
            (goal) =>
              sameAddress(wallet.address, goal.owner) ||
              sameAddress(wallet.address, goal.verifier) ||
              sameAddress(wallet.address, goal.failureRecipient),
          )
        : [],
    [solo.goals, wallet.address],
  );

  const relevantPacts = useMemo(() => {
    const owned = wallet.address
      ? pacts.pacts.filter(
          (pact) =>
            sameAddress(wallet.address, pact.creator) ||
            sameAddress(wallet.address, pact.partnerAddress) ||
            sameAddress(wallet.address, pact.forfeitureRecipient),
        )
      : [];
    return filter === 'all'
      ? owned
      : owned.filter((pact) => pact.status === filter);
  }, [filter, pacts.pacts, wallet.address]);

  const activeCommitments = useMemo(
    () => {
      const address = wallet.address;
      if (!address) return 0;

      const soloActive = relevantGoals.reduce((sum, goal) => {
        if (
          sameAddress(address, goal.owner) &&
          ['pending-verifier', 'active'].includes(goal.status)
        ) {
          return sum + 1;
        }
        return sum;
      }, 0);

      const pactActive = pacts.pacts.reduce((sum, pact) => {
        const isCreator = sameAddress(address, pact.creator);
        const isPartner = sameAddress(address, pact.partnerAddress);

        if (isCreator && pact.status === 'waiting') {
          return sum + 1;
        }

        if ((isCreator || isPartner) && pact.status === 'active') {
          return sum + 1;
        }

        return sum;
      }, 0);

      return soloActive + pactActive;
    },
    [pacts.pacts, relevantGoals, wallet.address],
  );

  const locked = useMemo(
    () => {
      const address = wallet.address;
      if (!address) return 0;

      const soloLocked = relevantGoals.reduce((sum, goal) => {
        if (
          sameAddress(address, goal.owner) &&
          ['pending-verifier', 'active'].includes(goal.status)
        ) {
          return sum + goal.amount;
        }
        return sum;
      }, 0);

      const pactLocked = relevantPacts.reduce((sum, pact) => {
        const isCreator = sameAddress(address, pact.creator);
        const isPartner = sameAddress(address, pact.partnerAddress);

        if (isCreator && pact.status === 'waiting') {
          return sum + pact.stake;
        }

        if ((isCreator || isPartner) && pact.status === 'active') {
          return sum + pact.stake;
        }

        return sum;
      }, 0);

      return soloLocked + pactLocked;
    },
    [relevantGoals, relevantPacts, wallet.address],
  );

  if (!isContractConfigured) {
    return (
      <div className="container protocol">
        <Message kind="error">
          The contract address is missing. Set
          <code> VITE_STAKEMATE_CONTRACT_ADDRESS</code> before using StakeMate.
        </Message>
      </div>
    );
  }

  return (
    <div className="container protocol">
      <div className="page-head">
        <div>
          <div className="section-kicker">STAKEMATE WORKSPACE</div>
          <h1>Make the commitment enforceable.</h1>
          <p>
            Every action below reads from or writes to the deployed StakeMate
            contract. There are no simulated transactions or sample pacts.
          </p>
        </div>
        <a
          className="btn secondary"
          href={`${BOT_CHAIN_CONFIG.explorerUrl}/address/${BOT_CHAIN_CONFIG.contractAddress}`}
          target="_blank"
          rel="noreferrer"
        >
          View contract <ExternalLink />
        </a>
      </div>

      <ConnectGate evidenceOnline={evidenceOnline} />

      <div className="live-stats">
        <div>
          <small>Active Commitments</small>
          <b>{activeCommitments}</b>
        </div>
        <div>
          <small>BOT currently locked</small>
          <b>{locked.toFixed(4)}</b>
        </div>
        <div>
          <small>Claimable BOT</small>
          <b>{claimLoading ? '…' : claimable.toFixed(4)}</b>
        </div>
        <div>
          <small>Network</small>
          <b>{BOT_CHAIN_CONFIG.chainName}</b>
        </div>
      </div>

      <div className="protocol-tabs">
        <button
          className={tab === 'solo' ? 'selected' : ''}
          onClick={() => setTab('solo')}
        >
          <UserRoundCheck /> Personal goal + friend verifier
        </button>
        <button
          className={tab === 'pact' ? 'selected' : ''}
          onClick={() => setTab('pact')}
        >
          <Users /> Two-person pact
        </button>
      </div>

      {tab === 'solo' ? (
        <Panel
          eyebrow="PERSONAL COMMITMENT"
          title="Lock your own stake. Choose one trusted verifier."
          copy="Your friend accepts responsibility, reviews signed proof after the deadline, and can release the BOT only when the goal qualifies."
        >
          <CreateSoloGoal afterCreate={refresh} />
        </Panel>
      ) : (
        <Panel
          eyebrow="SHARED COMMITMENT"
          title="Both people stake under the same rules."
          copy="Choose objective daily check-ins or a real-world result supported by signed evidence and partner review."
        >
            <CreateTwoPersonPact afterCreate={refreshSharedPacts} />
        </Panel>
      )}

      <section className="protocol-list-section">
        <div className="section-title">
          <div>
            <span className="section-kicker">PERSONAL GOALS</span>
            <h2>Owned, verified, or received by you</h2>
          </div>
          <button
            className="btn ghost"
            disabled={solo.loading || pacts.loading}
            onClick={() => void refresh()}
          >
            <RefreshCw className={solo.loading || pacts.loading ? 'spin' : ''} />
            Refresh all
          </button>
        </div>
        {solo.error && <Message kind="error">{solo.error}</Message>}
        {!wallet.connected && (
          <div className="protocol-empty">
            <Wallet />
            <p>Connect a wallet to load its personal goals.</p>
          </div>
        )}
        {wallet.connected && !solo.loading && relevantGoals.length === 0 && (
          <div className="protocol-empty">
            <UserRoundCheck />
            <p>No personal goals involve this wallet yet.</p>
          </div>
        )}
        <div className="protocol-card-grid">
          {relevantGoals.map((goal) => (
            <SoloGoalCard
              key={goal.id}
              goal={goal}
              address={wallet.address}
              refresh={refresh}
            />
          ))}
        </div>
      </section>

      <section className="protocol-list-section">
        <div className="section-title commitment-list-title">
          <div>
            <span className="section-kicker">TWO-PERSON PACTS</span>
            <h2>Shared commitments involving you</h2>
          </div>
          <div className="filters">
            {(
              [
                ['all', 'All'],
                ['active', 'Active'],
                ['waiting', 'Waiting'],
                ['finalized', 'Finalized'],
                ['cancelled', 'Cancelled'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={filter === value ? 'selected' : ''}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {pacts.error && <Message kind="error">{pacts.error}</Message>}
        {wallet.connected && !pacts.loading && relevantPacts.length === 0 && (
          <div className="protocol-empty">
            <Users />
            <p>No pacts match this wallet and filter.</p>
          </div>
        )}
        <div className="protocol-card-grid">
          {relevantPacts.map((pact) => (
            <PactCard
              key={pact.id}
              pact={pact}
              address={wallet.address}
              refresh={refresh}
            />
          ))}
        </div>
      </section>

      {busy && <PendingWalletNotice label={busy} />}
      <section className="claim-strip">
        <div>
          <Clock3 />
          <span>
            <b>{claimable.toFixed(4)} BOT claimable</b>
            <small>
              Refunds and settlements are credited first, then withdrawn in one
              safe transaction.
            </small>
          </span>
        </div>
        <button
          className="btn primary"
          disabled={Boolean(busy) || !wallet.connected || claimable <= 0}
          onClick={() => void run('Payout withdrawn', withdrawReward)}
        >
          {busy ? <LoaderCircle className="spin" /> : <Wallet />}
          Withdraw {claimable > 0 ? `${claimable.toFixed(4)} BOT` : 'claimable BOT'}
        </button>
      </section>
      {message && (
        <Message
          kind={message.kind}
          transactionHash={message.transactionHash}
        >
          {message.text}
        </Message>
      )}
    </div>
  );
}
