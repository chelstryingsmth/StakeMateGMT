import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  FileCheck2,
  QrCode,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Evidence, Pact, SoloGoal } from '../types';

export type CommitmentKind = 'goal' | 'pact';

export interface LifecycleStep {
  label: string;
  detail: string;
  done: boolean;
}

export const shortAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

export const shortDigest = (digest: string) =>
  `${digest.slice(0, 10)}...${digest.slice(-8)}`;

export const publicReceiptPath = (kind: CommitmentKind, id: string) =>
  `/receipt/${kind}/${id}`;

const hasResolvedGoal = (goal: SoloGoal) =>
  ['approved', 'rejected', 'expired'].includes(goal.status);

export function goalLifecycle(goal: SoloGoal): LifecycleStep[] {
  if (goal.status === 'cancelled') {
    return [
      {
        label: 'Created',
        detail: 'Stake locked by owner',
        done: true,
      },
      {
        label: 'Cancelled',
        detail: 'Owner cancelled before verifier acceptance',
        done: true,
      },
    ];
  }
  const resolved = hasResolvedGoal(goal);
  return [
    {
      label: 'Created',
      detail: 'Stake locked by owner',
      done: goal.createdAt > 0,
    },
    {
      label: 'Accepted',
      detail: 'Verifier accepted responsibility',
      done: goal.acceptedAt > 0 || resolved,
    },
    {
      label: 'Evidence',
      detail: goal.evidence.uri ? 'Signed proof recorded' : 'Waiting for proof',
      done: Boolean(goal.evidence.uri) || resolved,
    },
    {
      label: 'Reviewed',
      detail: resolved ? goal.status : 'Verifier decision pending',
      done: resolved,
    },
    {
      label: 'Settled',
      detail: resolved ? 'Payout credited on-chain' : 'Awaiting final result',
      done: resolved,
    },
  ];
}

export function pactLifecycle(pact: Pact): LifecycleStep[] {
  if (pact.status === 'cancelled') {
    return [
      {
        label: 'Created',
        detail: 'Creator stake locked',
        done: true,
      },
      {
        label: 'Cancelled',
        detail: 'Creator cancelled before a partner joined',
        done: true,
      },
    ];
  }
  const joined = pact.status !== 'waiting';
  const proofOrProgress =
    pact.mode === 'onchain'
      ? pact.creatorCheckIns > 0 || pact.partnerCheckIns > 0
      : Boolean(pact.creatorEvidence.uri || pact.partnerEvidence.uri);
  const resultReady = pact.status === 'finalized';
  return [
    {
      label: 'Created',
      detail: 'Creator stake locked',
      done: pact.createdAt > 0,
    },
    {
      label: 'Joined',
      detail: joined ? 'Partner matched the stake' : 'Waiting for partner',
      done: joined,
    },
    {
      label: 'Progress',
      detail:
        pact.mode === 'onchain'
          ? 'Check-ins recorded on-chain'
          : 'Signed evidence submitted',
      done: proofOrProgress || resultReady,
    },
    {
      label: 'Reviewed',
      detail: resultReady ? pact.outcome.replaceAll('-', ' ') : 'Result pending',
      done: resultReady,
    },
    {
      label: 'Settled',
      detail: resultReady ? 'Payout credited on-chain' : 'Awaiting finalization',
      done: resultReady,
    },
  ];
}

export function LifecycleStepper({
  steps,
  compact = false,
}: {
  steps: LifecycleStep[];
  compact?: boolean;
}) {
  const firstPending = steps.findIndex((step) => !step.done);
  const current = firstPending === -1 ? steps.length - 1 : firstPending;
  return (
    <ol className={`lifecycle ${compact ? 'compact' : ''}`} aria-label="Commitment lifecycle">
      {steps.map((step, index) => (
        <li
          key={step.label}
          className={`${step.done ? 'done' : ''} ${index === current ? 'current' : ''}`}
        >
          <span>{step.done ? <Check /> : index + 1}</span>
          <div>
            <b>{step.label}</b>
            {!compact && <small>{step.detail}</small>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function countdownCopy(targetSeconds: number, nowMs: number) {
  if (!targetSeconds) return 'Starts after acceptance';
  const remaining = Math.floor(targetSeconds - nowMs / 1_000);
  if (remaining <= 0) return 'Deadline reached';
  const days = Math.floor(remaining / 86_400);
  const hours = Math.floor((remaining % 86_400) / 3_600);
  const minutes = Math.max(1, Math.floor((remaining % 3_600) / 60));
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

export function DeadlineCountdown({ timestamp }: { timestamp: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="deadline-countdown">{countdownCopy(timestamp, now)}</span>;
}

export function EvidenceVerificationCard({
  evidence,
  label,
  showEmpty = false,
}: {
  evidence: Evidence;
  label: string;
  showEmpty?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!evidence.uri) {
    return showEmpty ? (
      <div className="evidence-verification empty">
        <FileCheck2 />
        <div>
          <b>{label}</b>
          <small>No signed proof has been recorded yet.</small>
        </div>
      </div>
    ) : null;
  }

  const copyDigest = async () => {
    await navigator.clipboard.writeText(evidence.digest);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <div className="evidence-verification">
      <div className="evidence-verification-head">
        <span>
          <ShieldCheck />
          <span>
            <b>{label}</b>
            <small>Signature verified · digest recorded on-chain</small>
          </span>
        </span>
        <em className={`decision ${evidence.decision}`}>{evidence.decision}</em>
      </div>
      <div className="evidence-verification-details">
        <span>
          <small>Submitted</small>
          <b>
            {evidence.submittedAt
              ? new Date(evidence.submittedAt * 1_000).toLocaleString()
              : 'Pending timestamp'}
          </b>
        </span>
        <span>
          <small>Evidence digest</small>
          <b>{shortDigest(evidence.digest)}</b>
        </span>
      </div>
      <div className="evidence-verification-actions">
        <a href={evidence.uri} target="_blank" rel="noreferrer">
          Open evidence <ExternalLink />
        </a>
        <button type="button" onClick={() => void copyDigest()}>
          {copied ? <Check /> : <Copy />}
          {copied ? 'Digest copied' : 'Copy digest'}
        </button>
      </div>
    </div>
  );
}

export function ShareCommitment({
  kind,
  id,
  title,
  compact = false,
}: {
  kind: CommitmentKind;
  id: string;
  title: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const path = publicReceiptPath(kind, id);
  const shareUrl = useMemo(
    () => `${window.location.origin}${path}`,
    [path],
  );
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(shareUrl)}`;

  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: `${title} · StakeMate`, url: shareUrl });
      return;
    }
    await copy();
  };

  return (
    <div className={`share-commitment ${compact ? 'compact' : ''}`}>
      <Link to={path} className="share-receipt-link">
        <ShieldCheck /> Public receipt
      </Link>
      <button type="button" onClick={() => void copy()}>
        {copied ? <Check /> : <Copy />}
        {copied ? 'Copied' : 'Copy link'}
      </button>
      <button type="button" onClick={() => void share().catch(() => undefined)}>
        <Share2 /> Share
      </button>
      <button type="button" onClick={() => setShowQr((value) => !value)}>
        <QrCode /> QR
      </button>
      {showQr && (
        <div className="share-qr">
          <img src={qrUrl} alt={`QR code for ${title}`} width="180" height="180" />
          <small>Scan to open the public on-chain receipt.</small>
        </div>
      )}
    </div>
  );
}
