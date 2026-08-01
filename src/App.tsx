import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  Check,
  Coins,
  ExternalLink,
  Goal,
  Handshake,
  LoaderCircle,
  LockKeyhole,
  ReceiptText,
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
import { publicReceiptPath } from './components/CommitmentDisplay';
import { useWallet } from './hooks/useWallet';

const Protocol = lazy(() => import('./pages/Protocol'));
const CommitmentReceipt = lazy(() => import('./pages/CommitmentReceipt'));

const TESTNET_FAUCET_URL = 'https://faucet.botchain.ai';

const shortAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

function WalletControl() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  if (wallet.connected && wallet.network === 'BOT Chain') {
    return (
      <div className="wallet-menu" ref={menuRef} style={{ position: 'relative' }}>
        <button
          className="btn secondary small"
          type="button"
          title="Wallet actions"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((value) => !value)}
        >
          <span className="network-dot" />
          {shortAddress(wallet.address!)}
        </button>
        {menuOpen && (
          <div
            className="wallet-menu-panel"
            role="menu"
            aria-label="Wallet actions"
            style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              minWidth: '198px',
              padding: '14px',
              background: '#f9f6ef',
              border: '1px solid #171512',
              borderRadius: '4px',
              boxShadow: '0 14px 30px rgba(23, 21, 18, 0.12)',
              zIndex: 20,
            }}
          >
            <small>Connected wallet</small>
            <b>{shortAddress(wallet.address!)}</b>
            <button
              className="btn danger small full"
              type="button"
              onClick={() => {
                void wallet.disconnect();
                setMenuOpen(false);
                navigate('/');
              }}
            >
              Logout
            </button>
          </div>
        )}
      </div>
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
          {BOT_CHAIN_CONFIG.networkName === 'testnet' && (
            <a href={TESTNET_FAUCET_URL} target="_blank" rel="noreferrer">
              Test BOT
            </a>
          )}
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

      <ReceiptLookup />

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

function ReceiptLookup() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<'goal' | 'pact'>('goal');
  const [id, setId] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalizedId = id.trim();
    if (!/^\d+$/.test(normalizedId) || Number(normalizedId) < 1) return;
    navigate(publicReceiptPath(kind, normalizedId));
  };

  return (
    <section className="receipt-lookup-section">
      <div>
        <span className="section-kicker">VERIFY WITHOUT A WALLET</span>
        <h2>Open a public commitment receipt.</h2>
        <p>
          Inspect stake, participants, evidence, deadlines, and settlement directly from the live contract.
        </p>
      </div>
      <form className="receipt-lookup" onSubmit={submit}>
        <label>
          <span>Commitment type</span>
          <select value={kind} onChange={(event) => setKind(event.target.value as 'goal' | 'pact')}>
            <option value="goal">Personal goal</option>
            <option value="pact">Two-person pact</option>
          </select>
        </label>
        <label>
          <span>On-chain ID</span>
          <input
            value={id}
            inputMode="numeric"
            pattern="[0-9]+"
            placeholder="e.g. 1"
            onChange={(event) => setId(event.target.value)}
          />
        </label>
        <button className="btn primary" disabled={!/^\d+$/.test(id.trim())}>
          <ReceiptText /> Verify receipt
        </button>
        {BOT_CHAIN_CONFIG.networkName === 'testnet' && (
          <a className="receipt-faucet-link" href={TESTNET_FAUCET_URL} target="_blank" rel="noreferrer">
            <Coins /> Need test BOT? Open the official faucet <ExternalLink />
          </a>
        )}
      </form>
    </section>
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

function ReceiptPage() {
  return (
    <Shell>
      <Suspense
        fallback={
          <div className="workspace-loading">
            <LoaderCircle className="spin" /> Reading live commitment receipt…
          </div>
        }
      >
        <CommitmentReceipt />
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
        <Route path="/receipt/:kind/:id" element={<ReceiptPage />} />
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
