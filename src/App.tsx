import { lazy, Suspense, type ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  ExternalLink,
  Goal,
  Handshake,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
  Users,
  Wallet,
} from 'lucide-react';
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import { BOT_CHAIN_CONFIG } from './config/blockchain';
import { useWallet } from './hooks/useWallet';

const Protocol = lazy(() => import('./pages/Protocol'));

const shortAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

function WalletControl() {
  const wallet = useWallet();
  const navigate = useNavigate();

  if (wallet.connected && wallet.network === 'BOT Chain') {
    return (
      <Link className="btn secondary small" to="/app" title={wallet.address ?? ''}>
        <span className="network-dot" />
        {shortAddress(wallet.address!)}
      </Link>
    );
  }

  return (
    <button
      className="btn primary small"
      disabled={wallet.connecting}
      onClick={() =>
        void wallet
          .connect()
          .then(() => navigate('/app'))
          .catch(() => undefined)
      }
    >
      {wallet.connecting ? <LoaderCircle className="spin" /> : <Wallet />}
      {wallet.connected ? 'Switch to BOT Chain' : 'Connect wallet'}
    </button>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <header>
        <Link to="/" className="logo" aria-label="StakeMate home">
          <span>
            <Handshake size={18} />
          </span>
          StakeMate
        </Link>
        <nav aria-label="Primary navigation">
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/app">Workspace</NavLink>
          <a
            href={`${BOT_CHAIN_CONFIG.explorerUrl}/address/${BOT_CHAIN_CONFIG.contractAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            Contract
          </a>
        </nav>
        <div className="head-actions">
          <WalletControl />
        </div>
      </header>
      <main>{children}</main>
      <footer>
        <span>StakeMate · real commitments on {BOT_CHAIN_CONFIG.chainName}</span>
        <a
          href={`${BOT_CHAIN_CONFIG.explorerUrl}/address/${BOT_CHAIN_CONFIG.contractAddress}`}
          target="_blank"
          rel="noreferrer"
        >
          Verified deployment <ExternalLink size={13} />
        </a>
      </footer>
    </>
  );
}

function Landing() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const openWorkspace = async () => {
    if (!wallet.connected || wallet.network !== 'BOT Chain') {
      await wallet.connect();
    }
    navigate('/app');
  };

  return (
    <Shell>
      <section className="hero">
        <div className="eyebrow">
          <ShieldCheck size={15} /> Live on BOT Chain Testnet
        </div>
        <h1>
          Put real stakes behind
          <br />
          <em>the promises that matter.</em>
        </h1>
        <p>
          Lock BOT into a personal goal with a trusted verifier, or create a
          two-person pact with transparent settlement rules.
        </p>
        <div className="hero-actions">
          <button
            className="btn primary"
            disabled={wallet.connecting}
            onClick={() => void openWorkspace().catch(() => undefined)}
          >
            {wallet.connecting ? <LoaderCircle className="spin" /> : <Wallet />}
            {wallet.connected ? 'Open workspace' : 'Connect and start'}
          </button>
          <a className="btn secondary" href="#how">
            See how it works <ArrowRight size={17} />
          </a>
        </div>
        {wallet.error && <small className="error-text">{wallet.error}</small>}
        <div className="trust">
          <LockKeyhole size={17} /> Non-custodial contract · Signed evidence ·
          Pull-based payouts
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-card left">
            <span className="avatar mint">
              <Goal size={15} />
            </span>
            <b>Study sprint</b>
            <small>1 BOT locked</small>
            <span className="approved">
              <UserRoundCheck size={14} /> Friend verifier
            </span>
          </div>
          <div className="rings">
            <span />
            <span />
            <Check />
          </div>
          <div className="art-card right">
            <span className="avatar amber">
              <Users size={15} />
            </span>
            <b>Shared pact</b>
            <small>Equal stakes · clear rules</small>
            <span className="approved">
              <ShieldCheck size={14} /> On-chain
            </span>
          </div>
        </div>
      </section>

      <section id="how" className="section">
        <div className="section-kicker">HOW STAKEMATE WORKS</div>
        <h2>
          One workspace, two ways
          <br />
          to stay accountable.
        </h2>
        <div className="steps">
          <div className="step">
            <span>01</span>
            <h3>Choose the right commitment</h3>
            <p>
              Use a personal goal when one person stakes, or a shared pact when
              both people lock the same amount.
            </p>
          </div>
          <div className="step">
            <span>02</span>
            <h3>Prove the result</h3>
            <p>
              Record daily check-ins on-chain or submit signed public evidence
              for human review.
            </p>
          </div>
          <div className="step">
            <span>03</span>
            <h3>Settle and withdraw</h3>
            <p>
              The contract calculates the outcome, credits the correct wallet,
              and lets recipients withdraw safely.
            </p>
          </div>
        </div>
      </section>

      <section className="cta">
        <div>
          <span className="eyebrow">CONNECTED TO THE LIVE CONTRACT</span>
          <h2>
            Ready to make
            <br />
            the commitment real?
          </h2>
        </div>
        <Link to="/app" className="btn light">
          Open StakeMate <ArrowRight size={18} />
        </Link>
      </section>
    </Shell>
  );
}

function Workspace() {
  return (
    <Shell>
      <Suspense
        fallback={
          <div className="workspace-loading">
            <LoaderCircle className="spin" /> Loading live contract workspace…
          </div>
        }
      >
        <Protocol />
      </Suspense>
    </Shell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<Workspace />} />
        <Route path="/dashboard" element={<Navigate to="/app" replace />} />
        <Route path="/protocol" element={<Navigate to="/app" replace />} />
        <Route path="/pacts/new" element={<Navigate to="/app" replace />} />
        <Route path="/pacts/:id" element={<Navigate to="/app" replace />} />
        <Route
          path="/pacts/:id/history"
          element={<Navigate to="/app" replace />}
        />
        <Route
          path="/pacts/:id/results"
          element={<Navigate to="/app" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
