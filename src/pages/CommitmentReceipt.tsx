import { useMemo, type ReactNode } from 'react';
import {
  ArrowLeft,
  Clock3,
  ExternalLink,
  FileCheck2,
  Handshake,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  DeadlineCountdown,
  EvidenceVerificationCard,
  LifecycleStepper,
  ShareCommitment,
  goalLifecycle,
  pactLifecycle,
  shortAddress,
} from '../components/CommitmentDisplay';
import { BOT_CHAIN_CONFIG } from '../config/blockchain';
import { usePact, useSoloGoal } from '../hooks/usePacts';
import { useWallet } from '../hooks/useWallet';
import { addressUrl } from '../services/pactService';

const sameAddress = (left?: string | null, right?: string | null) =>
  Boolean(left && right && left.toLowerCase() === right.toLowerCase());

const dateTime = (seconds: number, fallback = 'Not started') =>
  seconds ? new Date(seconds * 1_000).toLocaleString() : fallback;

function AddressReceipt({ address, role }: { address: string; role: string }) {
  return (
    <a className="receipt-address" href={addressUrl(address)} target="_blank" rel="noreferrer">
      <span>
        <small>{role}</small>
        <b>{shortAddress(address)}</b>
      </span>
      <ExternalLink />
    </a>
  );
}

function ReceiptLoading() {
  return (
    <div className="receipt-state">
      <Clock3 className="spin" />
      <h1>Reading the live contract…</h1>
      <p>This receipt is loaded directly from {BOT_CHAIN_CONFIG.chainName}.</p>
    </div>
  );
}

function ReceiptError({ message }: { message: string }) {
  return (
    <div className="receipt-state">
      <ShieldCheck />
      <h1>Receipt unavailable</h1>
      <p>{message}</p>
      <Link className="btn secondary" to="/">
        <ArrowLeft /> Back to StakeMate
      </Link>
    </div>
  );
}

function ReceiptShell({
  kind,
  id,
  title,
  status,
  role,
  children,
}: {
  kind: 'goal' | 'pact';
  id: string;
  title: string;
  status: string;
  role: string;
  children: ReactNode;
}) {
  return (
    <div className="container receipt-page">
      <Link className="receipt-back" to="/app">
        <ArrowLeft /> Back to workspace
      </Link>
      <section className="receipt-hero">
        <div>
          <span className="section-kicker">PUBLIC ON-CHAIN RECEIPT</span>
          <div className="receipt-badges">
            <span className={`badge ${status}`}>{status.replace('-', ' ')}</span>
            <span>{kind === 'goal' ? 'Personal goal' : 'Two-person pact'} #{id}</span>
            <span>{role}</span>
          </div>
          <h1>{title}</h1>
          <p>
            A read-only record from the deployed StakeMate contract. No wallet is required to verify it.
          </p>
        </div>
        <ShareCommitment kind={kind} id={id} title={title} />
      </section>
      {children}
      <section className="receipt-contract-strip">
        <ShieldCheck />
        <span>
          <b>Verified contract source</b>
          <small>{BOT_CHAIN_CONFIG.contractAddress}</small>
        </span>
        <a
          href={`${BOT_CHAIN_CONFIG.explorerUrl}/address/${BOT_CHAIN_CONFIG.contractAddress}`}
          target="_blank"
          rel="noreferrer"
        >
          Open explorer <ExternalLink />
        </a>
      </section>
    </div>
  );
}

function GoalReceipt({ id }: { id: string }) {
  const wallet = useWallet();
  const { goal, loading, error } = useSoloGoal(id);
  const role = useMemo(() => {
    if (!goal || !wallet.address) return 'Public viewer';
    if (sameAddress(wallet.address, goal.owner)) return 'Connected as owner';
    if (sameAddress(wallet.address, goal.verifier)) return 'Connected as verifier';
    if (sameAddress(wallet.address, goal.failureRecipient)) return 'Connected as neutral recipient';
    return 'Public viewer';
  }, [goal, wallet.address]);

  if (loading) return <ReceiptLoading />;
  if (error || !goal) return <ReceiptError message={error ?? 'Goal not found.'} />;

  const resolved = ['approved', 'rejected', 'expired'].includes(goal.status);
  const timeline = [
    { label: 'Stake locked', value: dateTime(goal.createdAt) },
    { label: 'Verifier accepted', value: dateTime(goal.acceptedAt, 'Waiting for verifier') },
    { label: 'Evidence submitted', value: dateTime(goal.evidence.submittedAt, 'Not submitted') },
    { label: 'Goal deadline', value: dateTime(goal.goalDeadline, 'Starts after acceptance') },
    { label: 'Resolved', value: dateTime(goal.resolvedAt, resolved ? goal.status : 'Pending') },
  ];

  return (
    <ReceiptShell kind="goal" id={goal.id} title={goal.title} status={goal.status} role={role}>
      <section className="receipt-summary-grid">
        <div className="receipt-primary-stat">
          <LockKeyhole />
          <small>Owner stake</small>
          <b>{goal.amount.toFixed(4)} BOT</b>
          <span>{resolved ? 'Settlement recorded' : 'Protected by the contract'}</span>
        </div>
        <div className="receipt-people">
          <AddressReceipt address={goal.owner} role="Owner" />
          <AddressReceipt address={goal.verifier} role="Friend verifier" />
          <AddressReceipt address={goal.failureRecipient} role="Neutral recipient" />
        </div>
        <div className="receipt-deadline">
          <Clock3 />
          <small>Goal deadline</small>
          <b>{dateTime(goal.goalDeadline, 'Starts after verifier acceptance')}</b>
          {!resolved && <DeadlineCountdown timestamp={goal.goalDeadline} />}
        </div>
      </section>

      <section className="receipt-section">
        <div className="receipt-section-head">
          <div>
            <span className="section-kicker">LIFECYCLE</span>
            <h2>Where this commitment stands</h2>
          </div>
          <Link className="btn secondary small" to={`/app?goal=${goal.id}`}>
            <UserRoundCheck /> Open action workspace
          </Link>
        </div>
        <LifecycleStepper steps={goalLifecycle(goal)} />
      </section>

      <section className="receipt-two-column">
        <div className="receipt-section">
          <span className="section-kicker">SIGNED EVIDENCE</span>
          <h2>Proof attached to the goal</h2>
          <EvidenceVerificationCard evidence={goal.evidence} label="Owner evidence" showEmpty />
        </div>
        <div className="receipt-section">
          <span className="section-kicker">ACTIVITY</span>
          <h2>Contract timeline</h2>
          <ol className="receipt-timeline">
            {timeline.map((event) => (
              <li key={event.label}>
                <span />
                <div><b>{event.label}</b><small>{event.value}</small></div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </ReceiptShell>
  );
}

function PactReceipt({ id }: { id: string }) {
  const wallet = useWallet();
  const { pact, loading, error } = usePact(id);
  const role = useMemo(() => {
    if (!pact || !wallet.address) return 'Public viewer';
    if (sameAddress(wallet.address, pact.creator)) return 'Connected as creator';
    if (sameAddress(wallet.address, pact.partnerAddress)) return 'Connected as partner';
    if (sameAddress(wallet.address, pact.forfeitureRecipient)) return 'Connected as neutral recipient';
    return 'Public viewer';
  }, [pact, wallet.address]);

  if (loading) return <ReceiptLoading />;
  if (error || !pact) return <ReceiptError message={error ?? 'Pact not found.'} />;

  const timeline = [
    { label: 'Creator stake locked', value: dateTime(pact.createdAt) },
    { label: 'Partner joined', value: dateTime(pact.startTime, 'Waiting for partner') },
    { label: 'Commitment deadline', value: dateTime(pact.endTime, 'Starts after joining') },
    { label: 'Review deadline', value: pact.mode === 'peer' ? dateTime(pact.reviewDeadline, 'Not started') : 'On-chain check-ins' },
    { label: 'Settlement', value: pact.status === 'finalized' ? pact.outcome.replaceAll('-', ' ') : 'Pending' },
  ];

  return (
    <ReceiptShell kind="pact" id={pact.id} title={pact.title} status={pact.status} role={role}>
      <section className="receipt-summary-grid">
        <div className="receipt-primary-stat">
          <Handshake />
          <small>Stake per participant</small>
          <b>{pact.stake.toFixed(4)} BOT</b>
          <span>{pact.status === 'active' ? `${(pact.stake * 2).toFixed(4)} BOT total pool` : pact.description}</span>
        </div>
        <div className="receipt-people">
          <AddressReceipt address={pact.creator} role="Creator" />
          <AddressReceipt address={pact.partnerAddress} role="Invited partner" />
          <AddressReceipt address={pact.forfeitureRecipient} role="Neutral recipient" />
        </div>
        <div className="receipt-deadline">
          <Clock3 />
          <small>Commitment deadline</small>
          <b>{dateTime(pact.endTime, 'Starts after partner joins')}</b>
          {pact.status === 'active' && <DeadlineCountdown timestamp={pact.endTime} />}
        </div>
      </section>

      <section className="receipt-section">
        <div className="receipt-section-head">
          <div>
            <span className="section-kicker">LIFECYCLE</span>
            <h2>Where this pact stands</h2>
          </div>
          <Link className="btn secondary small" to={`/app?pact=${pact.id}`}>
            <Users /> Open action workspace
          </Link>
        </div>
        <LifecycleStepper steps={pactLifecycle(pact)} />
      </section>

      <section className="receipt-two-column">
        <div className="receipt-section">
          <span className="section-kicker">VERIFICATION</span>
          <h2>{pact.mode === 'onchain' ? 'Daily check-in record' : 'Participant evidence'}</h2>
          {pact.mode === 'onchain' ? (
            <div className="checkin-receipt">
              <div><small>Creator</small><b>{pact.creatorCheckIns}/{pact.requiredCheckIns}</b></div>
              <div><small>Partner</small><b>{pact.partnerCheckIns}/{pact.requiredCheckIns}</b></div>
              <p><FileCheck2 /> Every accepted check-in is recorded by the contract.</p>
            </div>
          ) : (
            <div className="receipt-evidence-list">
              <EvidenceVerificationCard evidence={pact.creatorEvidence} label="Creator evidence" showEmpty />
              <EvidenceVerificationCard evidence={pact.partnerEvidence} label="Partner evidence" showEmpty />
            </div>
          )}
        </div>
        <div className="receipt-section">
          <span className="section-kicker">ACTIVITY</span>
          <h2>Contract timeline</h2>
          <ol className="receipt-timeline">
            {timeline.map((event) => (
              <li key={event.label}>
                <span />
                <div><b>{event.label}</b><small>{event.value}</small></div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </ReceiptShell>
  );
}

export default function CommitmentReceipt() {
  const { kind, id } = useParams();
  if (!id || (kind !== 'goal' && kind !== 'pact')) {
    return <ReceiptError message="Use a valid personal-goal or two-person-pact receipt link." />;
  }
  return kind === 'goal' ? <GoalReceipt id={id} /> : <PactReceipt id={id} />;
}
