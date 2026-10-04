import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getDatasetAnalysis, listDatasets, uploadDataset } from './api/datasets';
import { getNews, type NewsArticle } from './api/news';
import { getMarketConfiguration, getUpstoxAuthorizationUrl, marketWebSocketUrl, type MarketQuote } from './api/market';
import { clearAccessToken, getAccessToken, getCurrentUser, isDemoEmail, login, logout, saveAccessToken, signup } from './api/auth';
import type { AppState, AuthUser, DatasetAnalysis, DatasetListItem } from './types';
import { StatePanel, type StatePanelKind } from './components/StatePanel';
import { classifyUploadError, type UploadErrorKind } from './utils/errors';
import './styles.css';

type Page = 'home' | 'markets' | 'news' | 'studio' | 'auth' | 'privacy' | 'terms';
type AuthMode = 'signup' | 'login';

const marketData = [
  { day: '09:30', value: 100 }, { day: '10:00', value: 101.4 }, { day: '10:30', value: 100.8 },
  { day: '11:00', value: 102.3 }, { day: '11:30', value: 101.9 }, { day: '12:00', value: 103.1 },
  { day: '12:30', value: 102.7 }, { day: '13:00', value: 104.2 }, { day: '13:30', value: 103.9 },
  { day: '14:00', value: 105.1 }, { day: '14:30', value: 104.7 }, { day: '15:00', value: 106.3 },
  { day: '15:30', value: 106.8 }, { day: '16:00', value: 107.2 },
];

const sectors = [
  { name: 'Technology', symbol: 'TECH', change: '+2.84%', width: 88 },
  { name: 'Financials', symbol: 'FIN', change: '+1.92%', width: 67 },
  { name: 'Healthcare', symbol: 'HLTH', change: '+1.14%', width: 49 },
  { name: 'Energy', symbol: 'NRG', change: '-0.42%', width: 27 },
];

const watchlist = [
  { symbol: 'NVDA', name: 'NVIDIA Corp.', price: '$138.85', change: '+3.84%', positive: true, spark: [12, 14, 13, 16, 15, 18, 21] },
  { symbol: 'MSFT', name: 'Microsoft Corp.', price: '$421.50', change: '+1.36%', positive: true, spark: [16, 14, 15, 14, 17, 18, 19] },
  { symbol: 'TSLA', name: 'Tesla, Inc.', price: '$352.56', change: '-2.18%', positive: false, spark: [22, 18, 20, 16, 17, 13, 14] },
  { symbol: 'AAPL', name: 'Apple Inc.', price: '$229.98', change: '+0.72%', positive: true, spark: [14, 13, 14, 16, 15, 17, 18] },
];

const featureCards = [
  { number: '01', title: 'CSV Intelligence', body: 'Upload your own market dataset and automatically transform raw CSV data into useful analytics.', preview: 'csv' },
  { number: '02', title: 'Market Overview', body: 'Understand what is happening across major market indices, sectors, and asset categories.', preview: 'market' },
  { number: '03', title: 'Advanced Analytics', body: 'Analyze returns, volatility, drawdowns, moving averages, trends, correlations, and volume.', preview: 'analytics' },
  { number: '04', title: 'Stock Comparison', body: 'Compare multiple stocks side-by-side using normalized performance and key metrics.', preview: 'comparison' },
  { number: '05', title: 'Interactive Charts', body: 'Explore your data through responsive and interactive charts.', preview: 'charts' },
  { number: '06', title: 'AI Insights', body: 'Generate natural-language explanations of important trends and anomalies found in the uploaded dataset.', preview: 'ai' },
] as const;

function formatPercent(value: number | null, digits = 2) {
  return value === null ? '—' : `${(value * 100).toFixed(digits)}%`;
}

function App() {
  const [page, setPage] = useState<Page>('home');
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [datasets, setDatasets] = useState<DatasetListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<DatasetAnalysis | null>(null);
  const [appState, setAppState] = useState<AppState>('loading-datasets');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[] | null>(null);
  const [uploadErrorKind, setUploadErrorKind] = useState<UploadErrorKind | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const reduceMotion = useReducedMotion();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }
    void getCurrentUser(token).then((user) => {
      setAuthUser(user);
      setAuthChecking(false);
    }).catch(() => {
      clearAccessToken();
      setAuthChecking(false);
    });
  }, []);

  useEffect(() => {
    if (authUser && !isDemoEmail(authUser.email)) void loadDatasets();
  }, [authUser]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  async function loadDatasets() {
    try {
      const result = await listDatasets();
      setDatasets(result.datasets);
      if (result.datasets.length) {
        setSelectedId(result.datasets[0].id);
        setAppState('loading-analysis');
        await loadAnalysis(result.datasets[0].id);
      } else {
        setAppState('empty');
      }
    } catch {
      setAppState('error');
      setErrorMessage('The data room is temporarily unavailable.');
    }
  }

  async function loadAnalysis(id: number) {
    try {
      const result = await getDatasetAnalysis(id);
      setAnalysis(result);
      setAppState('ready');
    } catch {
      setAnalysis(null);
      setAppState('error');
      setErrorMessage('This analysis is temporarily unavailable.');
    }
  }

  async function handleUpload(file: File) {
    setAppState('uploading');
    setErrorMessage(null);
    setErrorDetails(null);
    setUploadErrorKind(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      const error = new Error('Unsupported format');
      error.name = 'UnsupportedFormatError';
      setUploadErrorKind('unsupported-format');
      setAppState('validation-error');
      return;
    }
    if (file.size === 0) {
      const error = new Error('Empty file');
      error.name = 'EmptyFileError';
      setUploadErrorKind('empty-file');
      setAppState('validation-error');
      return;
    }
    try {
      const result = await uploadDataset(file);
      setDatasets((current) => [...current, result.dataset]);
      setSelectedId(result.dataset.id);
      setPage('studio');
      setAppState('loading-analysis');
      await loadAnalysis(result.dataset.id);
    } catch (error) {
      setAppState('validation-error');
      const result = classifyUploadError(error);
      setUploadErrorKind(result.kind);
      setErrorDetails(result.details);
      setErrorMessage('We could not process this file.');
    }
  }

  function openStudio() {
    if (!authUser) {
      setAuthMode('signup');
      setPage('auth');
      setMobileOpen(false);
      return;
    }
    setPage('studio');
    setMobileOpen(false);
    setAccountOpen(false);
    if (!datasets.length) void loadDatasets();
  }

  function navigate(next: Page) {
    if (next === 'studio' && !authUser) {
      setAuthMode('signup');
      setPage('auth');
      setMobileOpen(false);
      return;
    }
    setPage(next);
    setMobileOpen(false);
    setAccountOpen(false);
  }

  async function handleLogout() {
    const token = getAccessToken();
    try {
      if (token) await logout(token);
    } catch {
      // The local session is cleared even if the server is unavailable.
    } finally {
      clearAccessToken();
      setAuthUser(null);
      setDatasets([]);
      setSelectedId(null);
      setAnalysis(null);
      setAppState('loading-datasets');
      setAccountOpen(false);
      setLogoutConfirmOpen(false);
      setPage('home');
    }
  }

  function openLogin() {
    setAuthMode('login');
    setAuthError(null);
    setPage('auth');
    setMobileOpen(false);
  }

  async function handleAuthSubmit(values: { name?: string; email: string; password: string }) {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const result = authMode === 'signup'
        ? await signup(values.name ?? '', values.email, values.password)
        : await login(values.email, values.password);
      saveAccessToken(result.token);
      setAuthUser(result.user);
      setPage('studio');
      setAppState(isDemoEmail(result.user.email) ? 'empty' : 'loading-datasets');
    } catch (error) {
      setAuthError(authMode === 'login' ? 'We could not sign you in. Check your email and password.' : 'We could not create your account. Check your details and try again.');
    } finally {
      setAuthBusy(false);
    }
  }

  if (authChecking) return <div className="app-shell auth-checking"><StatePanel kind="loading" compact /></div>;

  return (
    <div className="app-shell">
      <header className={scrolled ? 'topbar is-scrolled' : 'topbar'}>
          <button type="button" className="brand" onClick={() => navigate('home')} aria-label="Go to homepage">
          <span className="brand-mark"><span /></span>
          <span>Market<span className="brand-accent">Lens</span></span>
        </button>
        <nav className={mobileOpen ? 'main-nav is-open' : 'main-nav'}>
          <button className={page === 'home' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('home')}>Overview</button>
          <button className={page === 'markets' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('markets')}>Market</button>
          <button className={page === 'studio' ? 'nav-link active' : 'nav-link'} onClick={openStudio}>Analytics</button>
          <button className="nav-link" onClick={() => { navigate('home'); window.setTimeout(() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }), 0); }}>Features</button>
          <button className="nav-link" onClick={() => { navigate('home'); window.setTimeout(() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }), 0); }}>Pricing</button>
          <button className={page === 'news' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('news')}>News</button>
        </nav>
        <div className="topbar-actions">
          {authUser ? <div className="account-menu"><button type="button" className="account-button" onClick={() => setAccountOpen((open) => !open)} aria-expanded={accountOpen} aria-haspopup="menu"><span className="account-avatar">{authUser.name.slice(0, 1).toUpperCase()}</span><span>{authUser.name}</span><span className="account-chevron">⌄</span></button>{accountOpen && <div className="account-popover" role="menu"><div className="account-summary"><strong>{authUser.name}</strong><small>{authUser.email}</small></div><button type="button" role="menuitem" onClick={() => { setAccountOpen(false); setLogoutConfirmOpen(true); }}>Log out <span>↗</span></button></div>}</div> : <button type="button" className="login-button" onClick={openLogin}>Log in</button>}
          <button className="get-started-button" onClick={openStudio}>Get Started <span>↗</span></button>
          <button className="menu-button" onClick={() => setMobileOpen((open) => !open)} aria-label="Toggle navigation">Menu</button>
        </div>
      </header>

      <main>
        <AnimatePresence mode="wait">
          <motion.div key={page} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -6 }} transition={{ duration: .28, ease: 'easeOut' }}>
            {page === 'home' && <LandingPage onOpenStudio={openStudio} onExploreMarkets={() => navigate('markets')} reduceMotion={reduceMotion} />}
            {page === 'markets' && <MarketPageEnhanced onOpenStudio={openStudio} onConnectUpstox={async () => { const url = await getUpstoxAuthorizationUrl(); window.location.assign(url); }} reduceMotion={reduceMotion} />}
            {page === 'news' && <NewsPage onOpenStudio={openStudio} reduceMotion={reduceMotion} />}
          {page === 'studio' && <StudioPage datasets={datasets} selectedId={selectedId} analysis={analysis} state={appState} errorMessage={errorMessage} errorDetails={errorDetails} uploadErrorKind={uploadErrorKind} fileInput={fileInput} onSelect={(id) => { setSelectedId(id); setAnalysis(null); setAppState('loading-analysis'); void loadAnalysis(id); }} onUpload={handleUpload} onOpenFile={() => fileInput.current?.click()} onBack={() => navigate('home')} reduceMotion={reduceMotion} />}
            {page === 'auth' && <AuthPage mode={authMode} busy={authBusy} error={authError} onSubmit={handleAuthSubmit} onModeChange={(mode) => { setAuthMode(mode); setAuthError(null); }} onBack={() => navigate('home')} />}
            {page === 'privacy' && <LegalPage kind="privacy" onBack={() => navigate('home')} />}
            {page === 'terms' && <LegalPage kind="terms" onBack={() => navigate('home')} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <SiteFooter onNavigate={navigate} onOpenStudio={openStudio} />
      {logoutConfirmOpen && <LogoutConfirm onCancel={() => setLogoutConfirmOpen(false)} onConfirm={handleLogout} />}
    </div>
  );
}

function LogoutConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><motion.div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="logout-title" initial={{ opacity: 0, y: 10, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }}><span className="confirm-icon">↗</span><h2 id="logout-title">Are you sure you want to log out?</h2><p>Your active session will end and you will return to the MarketLens overview.</p><div className="confirm-actions"><button type="button" className="confirm-cancel" onClick={onCancel}>Cancel</button><button type="button" className="confirm-logout" onClick={onConfirm}>Log out <span>↗</span></button></div></motion.div></div>;
}

function SiteFooter({ onNavigate, onOpenStudio }: { onNavigate: (page: Page) => void; onOpenStudio: () => void }) {
  return <footer className="site-footer"><div className="footer-main"><div className="footer-brand-column"><button className="brand footer-brand" onClick={() => onNavigate('home')}><span className="brand-mark"><span /></span><span>Market<span className="brand-accent">Lens</span></span></button><p>Clarity for the decisions<br />behind the numbers.</p></div><FooterColumn title="Product"><button onClick={() => onNavigate('markets')}>Market</button><button onClick={onOpenStudio}>Analytics</button><button onClick={onOpenStudio}>Compare</button><button onClick={() => { onNavigate('home'); window.setTimeout(() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }), 0); }}>Features</button><button onClick={() => { onNavigate('home'); window.setTimeout(() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }), 0); }}>Pricing</button></FooterColumn><FooterColumn title="Resources"><button onClick={() => { onNavigate('home'); window.setTimeout(() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }), 0); }}>Guides</button><button onClick={onOpenStudio}>Documentation</button><button onClick={onOpenStudio}>API</button><button onClick={() => onNavigate('home')}>Help Center</button></FooterColumn><FooterColumn title="Company"><button onClick={() => { onNavigate('home'); window.setTimeout(() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }), 0); }}>About</button><button onClick={() => onNavigate('home')}>Contact</button><button onClick={() => onNavigate('privacy')}>Privacy</button><button onClick={() => onNavigate('terms')}>Terms</button></FooterColumn></div><div className="footer-bottom"><span>© 2026 MarketLens. All rights reserved.</span><span>MarketLens provides analytical tools and does not provide financial advice.</span></div></footer>;
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return <div className="footer-column"><span className="footer-column-title">{title}</span>{children}</div>;
}

function LegalPage({ kind, onBack }: { kind: 'privacy' | 'terms'; onBack: () => void }) {
  const privacy = kind === 'privacy';
  return <section className="legal-page page-container"><button className="back-link" onClick={onBack}>← Back to MarketLens</button><div className="eyebrow"><span className="eyebrow-dot" /> MARKETLENS LEGAL</div><h1>{privacy ? <>Privacy<br /><em>Policy.</em></> : <>Terms of<br /><em>Service.</em></>}</h1><p className="legal-updated">Last updated: October 4, 2026</p><div className="legal-layout"><aside><span className="panel-label">ON THIS PAGE</span><a href="#overview">Overview</a><a href="#data">Information we collect</a><a href="#use">How we use information</a><a href="#security">Security & retention</a><a href="#contact">Contact</a></aside><article className="legal-copy"><section id="overview"><h2>{privacy ? 'A clear approach to privacy' : 'A clear agreement for using MarketLens'}</h2><p>{privacy ? 'MarketLens is built for market research and analysis. This policy explains what information we collect, why we collect it, and the choices you have when using the service.' : 'These terms describe the agreement between you and MarketLens when you access our website, workspace, and analytical tools.'}</p></section><section id="data"><h2>{privacy ? 'Information we collect' : 'Using the service'}</h2><p>{privacy ? 'We collect account details such as your name and email address, authentication records needed to keep your workspace secure, and the market datasets you choose to upload. We may also receive basic technical information required to operate and improve the service.' : 'You may use MarketLens to upload and analyze data that you have the right to use. You are responsible for the accuracy, completeness, and lawful use of uploaded files. Do not upload confidential information that you are not authorized to process.'}</p></section><section id="use"><h2>{privacy ? 'How we use information' : 'Analytical information only'}</h2><p>{privacy ? 'We use information to authenticate your account, provide analysis, maintain service reliability, respond to requests, and improve the product. We do not sell personal information. We do not use uploaded data to provide personalized financial advice.' : 'MarketLens provides analytical tools and educational context. Results, visualizations, market snapshots, and generated explanations are not investment, tax, legal, or financial advice. You make decisions at your own risk.'}</p></section><section id="security"><h2>{privacy ? 'Security and retention' : 'Availability and limitations'}</h2><p>{privacy ? 'We use reasonable technical and organizational safeguards for account and session data. Uploaded datasets are retained to make your workspace useful and may be removed when you request deletion or when no longer needed for the service.' : 'We work to keep MarketLens available and accurate, but the service may change, pause, or contain errors. Market data may be delayed, incomplete, or based on illustrative values. To the extent allowed by law, MarketLens is provided without warranties.'}</p></section><section id="contact"><h2>Questions</h2><p>For privacy, account, or terms questions, contact the MarketLens team through the support channel associated with your workspace.</p></section></article></div></section>;
}

function LandingPage({ onOpenStudio, onExploreMarkets, reduceMotion }: { onOpenStudio: () => void; onExploreMarkets: () => void; reduceMotion: boolean | null }) {
  return (
    <>
      <section className="hero-section page-container">
        <motion.div className="hero-copy" initial={reduceMotion ? false : { opacity: 0, x: -14 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: .35 }} transition={{ duration: .55, ease: 'easeOut' }}>
          <div className="eyebrow"><span className="eyebrow-dot" /> MARKET INTELLIGENCE, WITHOUT THE NOISE</div>
          <h1>See the market<br /><em>in a new light.</em></h1>
          <p className="hero-subtitle">StockLens turns raw market data into focused analysis, clear signals, and the context behind every move.</p>
          <div className="hero-actions"><button className="button button-dark" onClick={onOpenStudio}>Analyze your data <span>↗</span></button><button className="text-button" onClick={onExploreMarkets}>Explore the market <span>→</span></button></div>
          <div className="hero-note"><span className="hero-note-rule" /><span>Built for independent research<br /><strong>and clearer market context</strong></span></div>
        </motion.div>
        <motion.div className="hero-visual" initial={reduceMotion ? false : { opacity: 0, scale: .97 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, amount: .35 }} transition={{ duration: .65, delay: .08, ease: 'easeOut' }}>
          <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
          <div className="hero-card hero-card-main">
            <div className="card-topline"><span>MARKET PULSE</span><span className="live-tag">ILLUSTRATIVE VIEW</span></div>
            <div className="hero-price">106.72 <span>+6.72%</span></div>
            <div className="hero-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={marketData}><defs><linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#55b991" stopOpacity={0.34} /><stop offset="100%" stopColor="#55b991" stopOpacity={0} /></linearGradient></defs><Area type="monotone" dataKey="value" stroke="#69c9a5" strokeWidth={2.5} fill="url(#heroFill)" /></AreaChart></ResponsiveContainer></div>
            <div className="hero-chart-labels"><span>09:30</span><span>12:00</span><span>16:00</span></div>
          </div>
          <div className="hero-card floating-stat"><span>VOLATILITY</span><strong>12.48%</strong><small>−2.31% this week</small></div>
          <div className="hero-card floating-signal"><span className="signal-ring">↗</span><div><span>SIGNAL STRENGTH</span><strong>Strong</strong></div></div>
          <div className="visual-caption">A clearer view of what matters.</div>
        </motion.div>
      </section>

      <section className="ticker-strip"><div className="ticker-inner"><span className="ticker-label">MARKET SNAPSHOT · SAMPLE</span><span>S&P 500 <b>5,842.16</b> <i>+0.84%</i></span><span>NASDAQ <b>19,164.30</b> <i>+1.12%</i></span><span>DOW JONES <b>43,444.99</b> <i>+0.27%</i></span><span>VIX <b>14.88</b> <small>−4.10%</small></span></div></section>

      <section className="statement-section page-container" id="about"><div className="section-kicker">WHY STOCKLENS</div><h2>Good decisions start<br />with <em>better context.</em></h2><p className="statement-copy">The market moves fast. Your understanding should move faster. StockLens gives you the tools to look past the headline, find the pattern, and act with conviction.</p></section>
      <section className="feature-grid page-container" id="features">{featureCards.map((feature, index) => <motion.article className="feature-card" key={feature.number} initial={reduceMotion ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: .4, delay: index * .06 }} whileHover={reduceMotion ? undefined : { y: -4 }}><div className="feature-card-top"><span className="feature-number">{feature.number}</span><FeaturePreview type={feature.preview} /></div><h3>{feature.title}</h3><p>{feature.body}</p><button className="arrow-button" onClick={onOpenStudio}>Explore feature <span>↗</span></button></motion.article>)}</section>
      <section className="cta-section page-container" id="pricing"><div><div className="section-kicker">START WITH A SIGNAL</div><h2>Your next insight<br /><em>is waiting.</em></h2></div><button className="button button-light" onClick={onOpenStudio}>Open the data studio <span>↗</span></button></section>
    </>
  );
}

type FeaturePreviewType = 'csv' | 'market' | 'analytics' | 'comparison' | 'charts' | 'ai';

function FeaturePreview({ type }: { type: FeaturePreviewType }) {
  if (type === 'csv') return <div className="feature-preview csv-preview"><div className="preview-window-bar"><i /><i /><i /></div><div className="csv-file"><span className="csv-badge">CSV</span><div><strong>market_data.csv</strong><small>2.4 MB · ready to analyze</small></div><b>✓</b></div><div className="upload-progress"><i /></div></div>;
  if (type === 'market') return <div className="feature-preview market-preview"><div className="preview-index-row"><span>S&amp;P 500</span><strong>5,842.16</strong><b>+0.84%</b></div><div className="preview-index-row"><span>NASDAQ</span><strong>19,164.30</strong><b>+1.12%</b></div><div className="preview-index-row"><span>VIX</span><strong>14.88</strong><em>−4.10%</em></div></div>;
  if (type === 'analytics') return <div className="feature-preview analytics-preview"><div className="analytics-bars"><i style={{ height: '38%' }} /><i style={{ height: '62%' }} /><i style={{ height: '48%' }} /><i style={{ height: '84%' }} /><i style={{ height: '70%' }} /><i style={{ height: '100%' }} /></div><div className="analytics-score"><span>VOLATILITY</span><strong>12.48%</strong><small>Low risk profile</small></div></div>;
  if (type === 'comparison') return <div className="feature-preview comparison-preview"><div className="comparison-row"><strong>AAPL</strong><span><i style={{ width: '82%' }} /></span><b>+38.4%</b></div><div className="comparison-row"><strong>MSFT</strong><span><i style={{ width: '69%' }} /></span><b>+29.2%</b></div><div className="comparison-row"><strong>NVDA</strong><span><i style={{ width: '94%' }} /></span><b>+51.7%</b></div></div>;
  if (type === 'charts') return <div className="feature-preview charts-preview"><div className="chart-toolbar"><span>1Y</span><span className="active">3M</span><span>1M</span><b>↗</b></div><svg viewBox="0 0 270 86" preserveAspectRatio="none"><defs><linearGradient id="featureChartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#55b991" stopOpacity=".34" /><stop offset="100%" stopColor="#55b991" stopOpacity="0" /></linearGradient></defs><path d="M0 67 C25 59 31 65 48 51 S72 63 89 43 S112 48 128 30 S151 42 169 27 S192 34 210 17 S241 29 270 8" fill="none" stroke="#16825f" strokeWidth="2.5" /><path d="M0 67 C25 59 31 65 48 51 S72 63 89 43 S112 48 128 30 S151 42 169 27 S192 34 210 17 S241 29 270 8 V86 H0Z" fill="url(#featureChartFill)" opacity=".55" /></svg></div>;
  return <div className="feature-preview ai-preview"><span className="ai-spark">✦</span><div><strong>AI INSIGHT</strong><p>Momentum strengthened after the 20-day average crossed above the 50-day trend.</p></div><span className="ai-arrow">↗</span></div>;
}

function MarketPage({ onOpenStudio, reduceMotion: _reduceMotion }: { onOpenStudio: () => void; reduceMotion: boolean | null }) {
  return <section className="market-page page-container"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> GLOBAL MARKETS · LIVE SNAPSHOT</div><h1>The market,<br /><em>at a glance.</em></h1></div><button className="button button-dark" onClick={onOpenStudio}>Analyze your data <span>↗</span></button></div><div className="market-layout"><section className="market-main panel"><div className="panel-heading"><div><span className="panel-label">COMPOSITE MARKET INDEX</span><h2>107.24 <span className="positive">+2.84%</span></h2></div><span className="live-tag"><i /> LIVE</span></div><div className="market-large-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={marketData}><defs><linearGradient id="marketFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#65ad92" stopOpacity={0.3} /><stop offset="100%" stopColor="#65ad92" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#e2e5e8" vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: '#8490a0', fontSize: 11 }} /><YAxis hide domain={['dataMin - 2', 'dataMax + 2']} /><Tooltip contentStyle={{ border: '1px solid #e0e4e7', borderRadius: 8, fontSize: 12 }} /><Area type="monotone" dataKey="value" stroke="#16825f" strokeWidth={2.5} fill="url(#marketFill)" /></AreaChart></ResponsiveContainer></div><div className="time-pills"><button className="selected">1D</button><button>1W</button><button>1M</button><button>3M</button><button>1Y</button></div></section><aside className="market-side"><section className="panel watch-panel"><div className="panel-heading"><span className="panel-label">WATCHLIST</span><button className="plus-button">+</button></div>{watchlist.map((stock) => <div className="watch-row" key={stock.symbol}><CompanyMark symbol={stock.symbol} /><div className="watch-name"><strong>{stock.symbol}</strong><small>{stock.name}</small></div><div className="mini-spark"><svg viewBox="0 0 70 24" preserveAspectRatio="none"><polyline points={stock.spark.map((point, index) => `${index * 11.5},${24 - point}`).join(' ')} fill="none" stroke={stock.positive ? '#16825f' : '#bd6658'} strokeWidth="2" /></svg></div><div className="watch-value"><strong>{stock.price}</strong><small className={stock.positive ? 'positive' : 'negative'}>{stock.change}</small></div></div>)}</section><section className="panel sectors-panel"><div className="panel-label">SECTOR MOMENTUM</div>{sectors.map((sector) => <div className="sector-row" key={sector.symbol}><span className="sector-icon">{sector.symbol.slice(0, 1)}</span><span className="sector-name">{sector.name}</span><span className="sector-bar"><i style={{ width: `${sector.width}%` }} /></span><strong className={sector.change.startsWith('+') ? 'positive' : 'negative'}>{sector.change}</strong></div>)}</section></aside></div></section>;
}

function MarketPageEnhanced({ onOpenStudio, onConnectUpstox, reduceMotion }: { onOpenStudio: () => void; onConnectUpstox: () => Promise<void>; reduceMotion: boolean | null }) {
  const [range, setRange] = useState('1D');
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [source, setSource] = useState<'upstox' | 'unavailable'>('unavailable');
  const [feedReason, setFeedReason] = useState<string | null>(null);
  useEffect(() => {
    let socket: WebSocket | null = null;
    let disposed = false;
    void getMarketConfiguration().then((configuration) => {
      if (!configuration.configured) { setFeedReason(configuration.reason); setSource('unavailable'); return; }
      socket = new WebSocket(marketWebSocketUrl());
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as { type?: string; status?: string; quote?: MarketQuote };
        if (message.type === 'status' && message.status === 'connected') setSource('upstox');
        if (message.type === 'status' && ['unavailable', 'unconfigured'].includes(message.status ?? '')) setSource('unavailable');
        if (message.type === 'quote' && message.quote) {
          setQuotes((current) => { const next = current.filter((item) => item.instrumentKey !== message.quote!.instrumentKey); return [...next, message.quote!]; });
          setSource('upstox');
        }
      };
      socket.onerror = () => { if (!disposed) { setFeedReason('stream_unavailable'); setSource('unavailable'); } };
    }).catch(() => { if (!disposed) { setFeedReason('backend_unavailable'); setSource('unavailable'); } });
    return () => { disposed = true; socket?.close(); };
  }, []);
  const displayQuotes = quotes;
  if (source === 'unavailable') { const reasonText = feedReason === 'missing_access_token' ? 'The server does not have an active Upstox access token.' : feedReason === 'missing_instruments' ? 'The server does not have any Upstox instruments configured.' : feedReason === 'invalid_instrument_configuration' ? 'The server instrument configuration is invalid.'  : feedReason === 'backend_unavailable' ? 'The MarketLens backend could not be reached.' : feedReason === 'stream_unavailable' ? 'The backend could not establish the Upstox live stream.' : 'The Upstox feed is unavailable.'; return <section className="market-page page-container"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> INDIAN MARKETS · UPSTOX</div><h1>Indian markets,<br /><em>at a glance.</em></h1><p className="page-intro">MarketLens only displays verified data returned by the server-side Upstox integration.</p></div><button className="button button-dark" onClick={onOpenStudio}>Analyze your data <span>↗</span></button></div><div className="panel upstox-empty-state"><span className="state-icon">—</span><h3>Upstox authentication is required</h3><p>{reasonText}</p>{feedReason === 'missing_access_token' && <button className="button button-dark" onClick={() => void onConnectUpstox()}>Connect Upstox <span>↗</span></button>}</div></section>; }
  return <section className="market-page page-container"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> GLOBAL MARKETS · {source === 'upstox' ? 'EXTERNAL DATA' : 'SAMPLE SNAPSHOT'}</div><h1>The market,<br /><em>at a glance.</em></h1><p className="page-intro">A focused market board for tracking direction, breadth, and the assets worth a closer look.</p></div><button className="button button-dark" onClick={onOpenStudio}>Analyze your data <span>↗</span></button></div><div className="market-index-strip"><MarketIndex label="S&P 500" value="5,842.16" change="+0.84%" /><MarketIndex label="NASDAQ" value="19,164.30" change="+1.12%" /><MarketIndex label="DOW JONES" value="43,444.99" change="+0.27%" /><MarketIndex label="VIX" value="14.88" change="−4.10%" negative /></div><div className="market-layout"><motion.section className="market-main panel" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><div className="panel-heading"><div><span className="panel-label">COMPOSITE MARKET INDEX · {source === 'upstox' ? 'EXTERNAL' : 'SAMPLE'}</span><h2>107.24 <span className="positive">+2.84%</span></h2><span className="market-session">Market open · 16:00 ET reference close</span></div><span className="sample-tag">{source === 'upstox' ? 'EXTERNAL DATA' : 'REFERENCE DATA'}</span></div><div className="market-large-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={marketData}><defs><linearGradient id="marketFillEnhanced" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#65ad92" stopOpacity={0.3} /><stop offset="100%" stopColor="#65ad92" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#e2e5e8" vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: '#8490a0', fontSize: 11 }} /><YAxis hide domain={['dataMin - 2', 'dataMax + 2']} /><Tooltip contentStyle={{ border: '1px solid #e0e4e7', borderRadius: 8, fontSize: 12 }} /><Area type="monotone" dataKey="value" stroke="#16825f" strokeWidth={2.5} fill="url(#marketFillEnhanced)" /></AreaChart></ResponsiveContainer></div><div className="market-chart-footer"><div className="time-pills">{['1D', '1W', '1M', '3M', '1Y'].map((item) => <button key={item} className={range === item ? 'selected' : ''} onClick={() => setRange(item)}>{item}</button>)}</div><span className="chart-footnote">{range} range · normalized index</span></div></motion.section><aside className="market-side"><section className="panel market-stats"><div className="panel-label">SESSION STATS</div><div className="session-grid"><span>Open<strong>105.88</strong></span><span>High<strong>107.61</strong></span><span>Low<strong>105.42</strong></span><span>Volume<strong>4.8B</strong></span></div><div className="breadth-line"><span>Market breadth</span><strong>72% advancing</strong></div><div className="breadth-track"><i /></div></section><section className="panel watch-panel"><div className="panel-heading"><span className="panel-label">WATCHLIST · {source === 'upstox' ? 'EXTERNAL' : 'SAMPLE'}</span><button className="plus-button">+</button></div>{displayQuotes.map((stock) => <div className="watch-row" key={stock.symbol}><div className={`stock-badge logo-${stock.symbol.toLowerCase()}`}>{stock.logo}</div><div className="watch-name"><strong>{stock.symbol}</strong><small>{stock.name}</small></div><div className="mini-spark"><svg viewBox="0 0 70 24" preserveAspectRatio="none"><polyline points="0,18 12,14 24,16 36,10 48,12 59,7 70,9" fill="none" stroke={stock.changePercent >= 0 ? '#16825f' : '#bd6658'} strokeWidth="2" /></svg></div><div className="watch-value"><strong>${stock.price.toFixed(2)}</strong><small className={stock.changePercent >= 0 ? 'positive' : 'negative'}>{stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%</small></div></div>)}</section></aside></div><section className="market-lower-grid"><div className="panel movers-panel"><div className="panel-heading"><span className="panel-label">TOP MOVERS · {source === 'upstox' ? 'EXTERNAL' : 'SAMPLE'}</span><span className="panel-label">TODAY</span></div><div className="movers-table"><div className="movers-head"><span>Asset</span><span>Last</span><span>Change</span></div>{displayQuotes.slice(0, 8).map((stock) => <div key={stock.symbol}><strong><span className={`table-logo logo-${stock.symbol.toLowerCase()}`}>{stock.logo}</span>{stock.symbol}</strong><span>${stock.price.toFixed(2)}</span><b className={stock.changePercent >= 0 ? 'positive' : 'negative'}>{stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%</b></div>)}</div></div><div className="panel sectors-panel"><div className="panel-label">SECTOR MOMENTUM · SAMPLE</div>{sectors.map((sector) => <div className="sector-row" key={sector.symbol}><span className="sector-icon">{sector.symbol.slice(0, 1)}</span><span className="sector-name">{sector.name}</span><span className="sector-bar"><i style={{ width: `${sector.width}%` }} /></span><strong className={sector.change.startsWith('+') ? 'positive' : 'negative'}>{sector.change}</strong></div>)}</div></section></section>;
}

function NewsPage({ onOpenStudio, reduceMotion }: { onOpenStudio: () => void; reduceMotion: boolean | null }) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void getNews().then(setArticles).catch((reason) => setError(reason instanceof Error ? reason.message : 'Market news is unavailable.')).finally(() => setLoading(false)); }, []);
  return <section className="news-page page-container"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> MARKET INTELLIGENCE · NEWS</div><h1>What is moving<br /><em>the market.</em></h1><p className="page-intro">Financial news, company developments, and market context from the connected news provider.</p></div><button className="button button-dark" onClick={onOpenStudio}>Analyze your data <span>↗</span></button></div>{loading ? <StatePanel kind="loading" /> : error ? <StatePanel kind="api" /> : articles.length === 0 ? <StatePanel kind="market-data" /> : <div className="news-grid">{articles.map((article, index) => <motion.article className={index === 0 ? 'news-card news-card-featured panel' : 'news-card panel'} key={article.id} initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35, delay: index * .04 }}>{article.imageUrl && <img src={article.imageUrl} alt="" className="news-image" loading="lazy" />}<div className="news-card-body"><div className="news-meta"><span>{article.source}</span><span>{article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : 'Latest'}</span></div><h2><a href={article.url} target="_blank" rel="noreferrer">{article.title}</a></h2><p>{article.summary}</p><div className="news-tags">{article.symbols.slice(0, 3).map((symbol) => <span key={symbol}>{symbol}</span>)}</div></div></motion.article>)}</div>}</section>;
}

function MarketIndex({ label, value, change, negative = false }: { label: string; value: string; change: string; negative?: boolean }) { return <div className="market-index"><span>{label}</span><strong>{value}</strong><small className={negative ? 'negative' : 'positive'}>{change}</small></div>; }

function CompanyMark({ symbol, className = '' }: { symbol: string; className?: string }) {
  const mark = symbol.toUpperCase();
  if (mark === 'AAPL') return <span className={`company-mark mark-aapl ${className}`} aria-label="Apple logo"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M20.7 5.7c.8-1 1.4-2.4 1.3-3.7-1.3.1-2.9.9-3.8 1.9-.8.9-1.5 2.3-1.3 3.6 1.5.1 2.9-.8 3.8-1.8ZM25.3 17.1c0-3.6 2.9-5.4 3-5.5-1.7-2.5-4.4-2.8-5.3-2.8-2.3-.3-4.5 1.4-5.7 1.4-1.2 0-3.1-1.4-5.1-1.4-2.6 0-5 1.5-6.3 3.8-2.7 4.7-.7 11.5 1.9 15.3 1.3 1.8 2.7 3.8 4.7 3.7 1.9-.1 2.7-1.2 5-1.2 2.3 0 3 1.2 5 1.1 2.1 0 3.4-1.8 4.7-3.6 1.5-2.1 2.1-4.1 2.2-4.2-.1 0-4.1-1.6-4.1-6.6Z" /></svg></span>;
  if (mark === 'MSFT') return <span className={`company-mark mark-msft ${className}`} aria-label="Microsoft logo"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 3h12v12H3z" /><path d="M17 3h12v12H17z" /><path d="M3 17h12v12H3z" /><path d="M17 17h12v12H17z" /></svg></span>;
  if (mark === 'GOOGL') return <span className={`company-mark mark-google ${className}`} aria-label="Google logo"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3a13 13 0 1 0 8.5 22.8l-3.1-3.2A8.3 8.3 0 1 1 16 7.7c1.8 0 3.5.6 4.8 1.7l3.3-3.2A13 13 0 0 0 16 3Z" /><path d="M29 14.3H16v4.9h7.3c-.8 2.5-3.1 4.2-7.3 4.2v5.1c7.7 0 13-5.1 13-12.8 0-.7 0-1-.1-1.4Z" /></svg></span>;
  if (mark === 'AMZN') return <span className={`company-mark mark-amzn ${className}`} aria-label="Amazon logo"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 12.5c1.2-4.2 4.4-6.5 8.7-6.5 4.8 0 7.8 2.7 7.8 7.5v5.2c0 2.3.5 3.8 1.5 5.2h-5.2c-.5-.8-.8-1.6-.9-2.6-1.4 1.9-3.4 3-6.1 3-4.1 0-6.8-2.2-6.8-5.8 0-3.8 2.8-5.7 7.9-5.7h4.6v-.5c0-1.8-.9-2.7-2.8-2.7-1.6 0-2.7.8-3 2.3H7Zm11.5 3.5h-3.9c-2.4 0-3.5.6-3.5 2.1 0 1.2 1 2 2.6 2 2.9 0 4.8-1.7 4.8-4.1Z" /><path d="M7 27c5.7 2.8 13.7 2.5 19.1-1.3.4-.3.8-.1.5.3-4.6 5-13.8 6.5-20 2.1-.4-.3-.1-.9.4-.6Z" /></svg></span>;
  if (mark === 'META') return <span className={`company-mark mark-meta ${className}`} aria-label="Meta logo"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 21.8c0-6.7 2.6-11.6 6.5-11.6 2.4 0 4.4 2 6.1 5.1 1.7-3.1 3.7-5.1 6.1-5.1 3.9 0 6.5 4.9 6.5 11.6 0 4.4-2 7.2-5 7.2-2.8 0-5-2.4-7.6-6.7-2.6 4.3-4.8 6.7-7.6 6.7-3 0-5-2.8-5-7.2Zm4.7 0c0 1.9.6 2.8 1.5 2.8 1.1 0 2.3-1.5 4-4-1.8-3-3-4.8-4-4.8-1 0-1.5 2.3-1.5 6Zm12.6 2.8c.9 0 1.5-.9 1.5-2.8 0-3.7-.5-6-1.5-6-1 0-2.2 1.8-4 4.8 1.7 2.5 2.9 4 4 4Z" /></svg></span>;
  return <span className={`company-mark mark-letter ${className}`} aria-label={`${symbol} logo`}>{symbol.slice(0, 1)}</span>;
}

function AuthPage({ mode, busy, error, onSubmit, onModeChange, onBack }: { mode: AuthMode; busy: boolean; error: string | null; onSubmit: (values: { name?: string; email: string; password: string }) => void; onModeChange: (mode: AuthMode) => void; onBack: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const isSignup = mode === 'signup';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (isSignup && name.trim().length < 2) return;
    if (!email.includes('@') || password.length < 8) return;
    onSubmit({ name, email, password });
  }

  return <section className="auth-page page-container"><div className="auth-shell"><div className="auth-aside"><button type="button" className="back-link" onClick={onBack}>← Back to MarketLens</button><div className="eyebrow"><span className="eyebrow-dot" /> PRIVATE MARKET WORKSPACE</div><h1>{isSignup ? <>Your edge<br /><em>starts here.</em></> : <>Welcome<br /><em>back.</em></>}</h1><p>{isSignup ? 'Create a workspace for sharper analysis, better context, and fewer tabs.' : 'Pick up where you left off and keep your market context close.'}</p><div className="auth-aside-note"><span>01</span><span>Secure workspace access<br />for your market data</span></div></div><div className="auth-card panel"><div className="auth-card-header"><span className="brand-mini">Market<span>Lens</span></span><span className="panel-label">{isSignup ? 'CREATE ACCOUNT' : 'SIGN IN'}</span></div><h2>{isSignup ? 'Start your analysis workspace' : 'Sign in to continue'}</h2><p className="auth-intro">{isSignup ? 'No noise. Just a clear place to understand your data.' : 'Your datasets and analysis are waiting.'}</p><div className="demo-note"><strong>Demo access</strong><span>Use any address ending in <b>@example.com</b>. No email verification is required.</span></div><form onSubmit={submit} noValidate>{isSignup && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" autoComplete="name" required /></label>}<label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8 characters minimum" autoComplete={isSignup ? 'new-password' : 'current-password'} minLength={8} required /></label>{error && <div className="auth-error" role="alert">{error}</div>}<button type="submit" className="button button-dark auth-submit" disabled={busy}>{busy ? 'Opening workspace…' : isSignup ? 'Create free account' : 'Log in to workspace'} <span>↗</span></button></form><div className="auth-switch">{isSignup ? 'Already have an account?' : 'New to MarketLens?'} <button type="button" onClick={() => onModeChange(isSignup ? 'login' : 'signup')}>{isSignup ? 'Log in' : 'Create an account'}</button></div><small className="auth-legal">By continuing, you agree to use MarketLens for research and analysis only.</small></div></div></section>;
}

interface StudioProps { datasets: DatasetListItem[]; selectedId: number | null; analysis: DatasetAnalysis | null; state: string; errorMessage: string | null; errorDetails: string[] | null; uploadErrorKind: UploadErrorKind | null; fileInput: React.RefObject<HTMLInputElement>; onSelect: (id: number) => void; onUpload: (file: File) => void; onOpenFile: () => void; onBack: () => void; reduceMotion: boolean | null; }

function StudioPage({ datasets, selectedId, analysis, state, errorMessage, errorDetails, uploadErrorKind, fileInput, onSelect, onUpload, onOpenFile, onBack, reduceMotion: _reduceMotion }: StudioProps) {
  const closeData = useMemo(() => analysis?.series.map((point) => ({ date: point.date, close: point.close, ma20: point.moving_average_20, ma50: point.moving_average_50 })) ?? [], [analysis]);
  const volumeData = useMemo(() => analysis?.series.map((point) => ({ date: point.date, volume: point.volume })) ?? [], [analysis]);
  const latest = analysis?.series[analysis.series.length - 1];
  const first = analysis?.series[0];
  const periodReturn = first && latest ? latest.close / first.close - 1 : null;
  if (state === 'uploading' || state === 'loading-analysis') return <section className="studio-page"><StatePanel kind="loading" /></section>;
  if (state === 'error') return <section className="studio-page"><StatePanel kind="api" actionLabel="Retry analysis" onAction={() => selectedId !== null && onSelect(selectedId)} /></section>;
  if (state === 'validation-error') return <section className="studio-page"><StatePanel kind={uploadErrorKind ?? 'corrupted-data'} details={errorDetails} actionLabel="Choose another CSV" onAction={onOpenFile} /></section>;
  if (!analysis) return <section className="studio-page"><StatePanel kind="empty" actionLabel="Choose CSV" onAction={onOpenFile} /></section>;
  return <section className="studio-page"><div className="studio-header"><div><button className="back-link" onClick={onBack}>← Back to overview</button><div className="eyebrow"><span className="eyebrow-dot" /> PERSONAL DATA STUDIO</div><h1>Understand your<br /><em>market data.</em></h1></div><div className="studio-actions"><button className="button button-dark" onClick={onOpenFile}>Upload CSV <span>↑</span></button><input ref={fileInput} type="file" accept=".csv" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = ''; }} /></div></div><div className="studio-toolbar"><div className="dataset-select-wrap"><span className="panel-label">ACTIVE DATASET</span><select value={selectedId ?? ''} onChange={(event) => onSelect(Number(event.target.value))}><option value="" disabled>Select a dataset</option>{datasets.map((dataset) => <option value={dataset.id} key={dataset.id}>{dataset.name}</option>)}</select></div><div className="data-status"><span className="status-dot" /> {state === 'uploading' ? 'Uploading data' : state === 'loading-analysis' ? 'Computing analysis' : 'Workspace synced'}</div></div>{state === 'uploading' || state === 'loading-analysis' ? <div className="loading-state panel"><div className="loading-spinner" /><h3>{state === 'uploading' ? 'Reading your market data' : 'Building your analysis'}</h3><p>Calculating trend, risk, and performance context.</p></div> : state === 'error' ? <div className="empty-state panel"><span className="empty-icon">!</span><h3>{errorMessage ?? 'Analysis unavailable'}</h3><p>Check the backend connection and try again.</p></div> : state === 'validation-error' ? <div className="empty-state panel"><span className="empty-icon">!</span><h3>{errorMessage ?? 'CSV could not be processed'}</h3>{errorDetails?.map((detail) => <p key={detail}>{detail}</p>)}</div> : analysis ? <><div className="analysis-title-row"><div><span className="panel-label">ANALYSIS OVERVIEW</span><h2>{analysis.dataset.name}</h2><p>{analysis.dataset.date_range.start_date} — {analysis.dataset.date_range.end_date} <span>·</span> {analysis.dataset.row_count.toLocaleString()} observations</p></div><div className="period-chip">FULL PERIOD <strong>{formatPercent(periodReturn)}</strong></div></div><div className="metrics-grid"><Metric label="Latest close" value={latest ? `$${latest.close.toFixed(2)}` : '—'} detail={latest ? latest.date : 'No data'} /><Metric label="Period return" value={formatPercent(periodReturn)} detail="From first to last close" positive={periodReturn !== null && periodReturn >= 0} /><Metric label="Volatility" value={formatPercent(analysis.metrics.annualized_volatility)} detail="Annualized" /><Metric label="Max drawdown" value={formatPercent(analysis.metrics.maximum_drawdown)} detail="Peak to trough" negative /></div><div className="analysis-grid"><section className="panel chart-panel"><div className="panel-heading"><div><span className="panel-label">PRICE & TREND</span><h3>Close price with moving averages</h3></div><span className="chart-legend"><i className="legend-blue" /> Close <i className="legend-green" /> MA20 <i className="legend-amber" /> MA50</span></div><div className="large-analysis-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={closeData}><CartesianGrid stroke="#e9e9e2" vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={40} tick={{ fill: '#8a8d83', fontSize: 11 }} /><YAxis domain={['auto', 'auto']} tickLine={false} axisLine={false} tick={{ fill: '#8a8d83', fontSize: 11 }} /><Tooltip contentStyle={{ border: '1px solid #dedfd6', borderRadius: 8, fontSize: 12 }} /><Line type="monotone" dataKey="close" stroke="#3557a5" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="ma20" stroke="#78aa32" strokeWidth={1.5} dot={false} connectNulls /><Line type="monotone" dataKey="ma50" stroke="#d08e3e" strokeWidth={1.5} dot={false} connectNulls /></LineChart></ResponsiveContainer></div></section><section className="panel chart-panel"><div className="panel-heading"><div><span className="panel-label">TRADING ACTIVITY</span><h3>Volume by session</h3></div><span className="panel-label">{analysis.series.length} DAYS</span></div><div className="volume-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={volumeData}><CartesianGrid stroke="#e9e9e2" vertical={false} /><XAxis dataKey="date" hide /><YAxis hide /><Tooltip contentStyle={{ border: '1px solid #dedfd6', borderRadius: 8, fontSize: 12 }} /><Bar dataKey="volume" fill="#b6d878" radius={[2, 2, 0, 0]} /></BarChart></ResponsiveContainer></div></section></div></> : <div className="empty-state panel"><span className="empty-icon">+</span><h3>Your analysis starts here</h3><p>Upload a CSV with date, open, high, low, close, and volume columns.</p><button className="button button-dark" onClick={onOpenFile}>Choose CSV <span>↑</span></button></div>}</section>;
}

function Metric({ label, value, detail, positive, negative }: { label: string; value: string; detail: string; positive?: boolean; negative?: boolean }) { return <div className="metric-card"><span className="panel-label">{label}</span><strong className={positive ? 'positive' : negative ? 'negative' : ''}><AnimatedMetricValue value={value} /></strong><small>{detail}</small></div>; }

function AnimatedMetricValue({ value }: { value: string }) {
  const match = value.match(/^([^\d-]*)(-?[\d,.]+)(.*)$/);
  const numericValue = match ? Number(match[2].replace(/,/g, '')) : null;
  const spring = useSpring(numericValue ?? 0, { stiffness: 90, damping: 20, mass: .7 });
  const formatted = useTransform(spring, (current) => {
    if (numericValue === null) return value;
    const decimals = match?.[2].split('.')[1]?.length ?? 0;
    return `${match?.[1] ?? ''}${current.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${match?.[3] ?? ''}`;
  });

  useEffect(() => {
    if (numericValue !== null) spring.set(numericValue);
  }, [numericValue, spring]);

  return numericValue === null ? value : <motion.span>{formatted}</motion.span>;
}

interface ErrorBoundaryState { hasError: boolean; }

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void error;
    void info;
  }

  render() {
    if (this.state.hasError) {
      return <div className="app-shell auth-checking"><section className="state-panel panel"><span className="state-icon">!</span><h3>Something went wrong</h3><p>MarketLens could not render this screen. Refresh the page to continue.</p><button type="button" className="button button-dark state-action" onClick={() => window.location.reload()}>Refresh MarketLens <span>↗</span></button></section></div>;
    }
    return this.props.children;
  }
}

function SafeApp() {
  return <AppErrorBoundary><App /></AppErrorBoundary>;
}

export default SafeApp;
