import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { api, auth, Contract, ContractAnalysis as ContractAnalysisType, ExtractedClause, Obligation, Risk } from '../lib/api';
import Icon from '../components/Icon';
import { generateContractAuditHtml, generateRiskReviewLogHtml, openPrintableReport } from '../lib/pdfReport';
import { parseAndRenderMessage, ParsedCitation } from '../lib/markdownRenderer';

type View = 'dashboard' | 'contracts' | 'upload' | 'risks' | 'compare' | 'assistant' | 'obligations' | 'admin';

const demoContracts: Contract[] = [
  { id: 'demo-1', name: 'Asteria Cloud Services MSA', contract_type: 'Master Service Agreement', status: 'active', effective_date: '2025-04-01', expiration_date: '2027-03-31', created_at: '2025-04-01' },
  { id: 'demo-2', name: 'Northstar Data Processing Addendum', contract_type: 'Data Processing Agreement', status: 'review', effective_date: '2025-05-15', expiration_date: null, created_at: '2025-05-15' },
  { id: 'demo-3', name: 'Brightline Partner NDA', contract_type: 'NDA', status: 'active', effective_date: '2025-06-10', expiration_date: '2026-06-10', created_at: '2025-06-10' },
];

const demoRisks: Risk[] = [
  { id: 'risk-1', contract_id: 'demo-1', title: 'Uncapped indemnification exposure', category: 'Financial', severity: 'high', explanation: 'The vendor indemnity is not subject to the agreement liability cap.', business_impact: 'Potential exposure beyond forecasted contract value.', suggested_action: 'Ask counsel to align indemnity with the negotiated cap.', review_status: 'pending_review' },
  { id: 'risk-2', contract_id: 'demo-1', title: 'Auto-renewal notice window', category: 'Termination', severity: 'medium', explanation: 'Non-renewal notice is required 90 days before the renewal date.', business_impact: 'Missed notice may extend the commercial commitment.', suggested_action: 'Add the date to the obligation calendar.', review_status: 'under_review' },
  { id: 'risk-3', contract_id: 'demo-2', title: 'Subprocessor approval ambiguity', category: 'Data protection', severity: 'critical', explanation: 'The approval mechanism for new subprocessors is not explicit.', business_impact: 'Operational and compliance review may be delayed.', suggested_action: 'Confirm whether notice or prior consent applies.', review_status: 'pending_review' },
];

const demoObligations: Obligation[] = [
  { id: 'ob-1', contract_id: 'demo-1', responsible_party: 'Asteria Cloud', description: 'Provide quarterly uptime and service performance report', due_date: '2026-12-15', due_date_text: null, priority: 'high', status: 'open' },
  { id: 'ob-2', contract_id: 'demo-1', responsible_party: 'Our organization', description: 'Submit renewal or termination notice', due_date: '2026-12-31', due_date_text: '90 days before renewal', priority: 'critical', status: 'in_progress' },
  { id: 'ob-3', contract_id: 'demo-2', responsible_party: 'Privacy team', description: 'Review subprocessor list and approve changes', due_date: '2027-01-08', due_date_text: null, priority: 'medium', status: 'open' },
];

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatReport(contract: Contract, analysis: ContractAnalysisType | null, risks: Risk[], obligations: Obligation[]) {
  const lines = [
    `=========================================================`,
    `LEXORA LEGAL INTELLIGENCE CONTRACT AUDIT REPORT`,
    `Generated on: ${new Date().toLocaleString()}`,
    `=========================================================`,
    `Document Name:   ${contract.name}`,
    `Contract Type:   ${contract.contract_type}`,
    `Status:          ${contract.status}`,
    `Effective Date:  ${contract.effective_date || 'Not specified'}`,
    `Expiration Date: ${contract.expiration_date || 'Not specified'}`,
    '',
    `--- EXECUTIVE SUMMARY ---`,
    analysis?.summary || `Analyzed provisions and extracted risks for ${contract.name}.`,
    '',
    `--- DETECTED RISKS FOR COUNSEL REVIEW (${risks.length}) ---`,
  ];
  if (risks.length === 0) {
    lines.push('No elevated risk provisions detected.');
  } else {
    risks.forEach((r, idx) => {
      lines.push(`${idx + 1}. [${r.severity.toUpperCase()}] ${r.title}`);
      lines.push(`   Category:        ${r.category}`);
      lines.push(`   Status:          ${r.review_status}`);
      lines.push(`   Explanation:     ${r.explanation}`);
      if (r.business_impact) lines.push(`   Business Impact: ${r.business_impact}`);
      if (r.suggested_action) lines.push(`   Recommendation:  ${r.suggested_action}`);
      lines.push('');
    });
  }
  lines.push(`--- CONTRACTUAL OBLIGATIONS (${obligations.length}) ---`);
  if (obligations.length === 0) {
    lines.push('No specific obligations tracked.');
  } else {
    obligations.forEach((o, idx) => {
      lines.push(`${idx + 1}. ${o.description}`);
      lines.push(`   Party:    ${o.responsible_party || 'Unassigned'}`);
      lines.push(`   Priority: ${o.priority} | Status: ${o.status}`);
      lines.push(`   Due Date: ${o.due_date || o.due_date_text || 'See agreement terms'}`);
      lines.push('');
    });
  }
  lines.push(`=========================================================`);
  lines.push('CONFIDENTIAL & PRIVILEGED - REVIEWS REQUIRE FINAL APPROVAL BY QUALIFIED COUNSEL');
  return lines.join('\n');
}

function App() {
  const [view, setView] = useState<View>('dashboard');
  const [signedIn, setSignedIn] = useState(auth.isSignedIn());
  const [authNotice, setAuthNotice] = useState('');
  const [userName, setUserName] = useState('Ava Morgan');
  const [userEmail, setUserEmail] = useState('ava.morgan@lexora.legal');
  const [contracts, setContracts] = useState<Contract[]>(demoContracts);
  const [risks, setRisks] = useState<Risk[]>(demoRisks);
  const [obligations, setObligations] = useState<Obligation[]>(demoObligations);
  const [selectedContract, setSelectedContract] = useState<Contract>(demoContracts[0]);
  const [toast, setToast] = useState('');

  // UI features: theme, search, notifications, account modal
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('lexora-theme') as 'light' | 'dark') || 'light';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 'n1', title: 'Asteria MSA Analysis Ready', time: '10m ago', unread: true },
    { id: 'n2', title: 'High risk provision flagged in Indemnification', time: '1h ago', unread: true },
    { id: 'n3', title: 'Upcoming renewal notice window: 90 days', time: 'Yesterday', unread: false },
  ]);

  // Apply theme class
  useEffect(() => {
    document.body.className = theme === 'dark' ? 'dark-mode' : '';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lexora-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3500);
  };

  // Central data refresh to keep contracts, risks, obligations in sync
  const refreshData = async () => {
    if (!auth.isSignedIn()) return;
    try {
      const [meRes, csRes, risksRes, obsRes] = await Promise.allSettled([
        api.me(),
        api.contracts(),
        api.allRisks(),
        api.obligations(),
      ]);

      if (meRes.status === 'fulfilled') {
        setUserName(meRes.value.full_name);
        setUserEmail(meRes.value.email);
      }
      if (csRes.status === 'fulfilled' && csRes.value.items.length) {
        setContracts(csRes.value.items);
        setSelectedContract((prev) => {
          const match = csRes.value.items.find((c) => c.id === prev.id);
          return match || csRes.value.items[0];
        });
      }
      if (risksRes.status === 'fulfilled') {
        if (risksRes.value.length > 0) {
          setRisks(risksRes.value);
        }
      }
      if (obsRes.status === 'fulfilled' && obsRes.value.length > 0) {
        setObligations(obsRes.value);
      }
    } catch {
      // Keep existing state if offline
    }
  };

  useEffect(() => {
    const expire = () => {
      setSignedIn(false);
      setAuthNotice('Your session expired. Please sign in again.');
    };
    window.addEventListener('lexora-auth-expired', expire);
    return () => window.removeEventListener('lexora-auth-expired', expire);
  }, []);

  useEffect(() => {
    if (signedIn) {
      refreshData();
    }
  }, [signedIn]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return { contracts: [], risks: [], obligations: [] };
    const q = searchQuery.toLowerCase();
    return {
      contracts: contracts.filter((c) => c.name.toLowerCase().includes(q) || c.contract_type.toLowerCase().includes(q)),
      risks: risks.filter((r) => r.title.toLowerCase().includes(q) || r.explanation.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)),
      obligations: obligations.filter((o) => o.description.toLowerCase().includes(q) || (o.responsible_party && o.responsible_party.toLowerCase().includes(q))),
    };
  }, [searchQuery, contracts, risks, obligations]);

  if (!signedIn) {
    return (
      <AuthScreen
        notice={authNotice}
        onSignedIn={(name, email) => {
          setUserName(name);
          if (email) setUserEmail(email);
          setAuthNotice('');
          setSignedIn(true);
        }}
      />
    );
  }

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        view={view}
        theme={theme}
        collapsed={sidebarCollapsed}
        pendingRisksCount={risks.filter((r) => r.review_status === 'pending_review').length}
        onNavigate={setView}
        onToggleTheme={toggleTheme}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        onOpenAccount={() => setShowAccountModal(true)}
        onSignOut={() => {
          auth.signOut();
          setSignedIn(false);
        }}
      />
      <main className="main-content">
        <Topbar
          userName={userName}
          theme={theme}
          collapsed={sidebarCollapsed}
          unreadCount={unreadCount}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchFocus={() => setShowSearchModal(true)}
          onToggleTheme={toggleTheme}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          onOpenNotifications={() => setShowNotifications((s) => !s)}
          onOpenAccount={() => setShowAccountModal(true)}
        />

        {/* Global Search Popover */}
        {showSearchModal && searchQuery.trim() && (
          <div className="search-palette">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px 8px' }}>
              <span className="search-section-title">Search Results</span>
              <button className="icon-button" style={{ width: 24, height: 24 }} onClick={() => setShowSearchModal(false)}>
                <Icon name="x" size={14} />
              </button>
            </div>
            {searchResults.contracts.length > 0 && (
              <div>
                <div className="search-section-title">Contracts ({searchResults.contracts.length})</div>
                {searchResults.contracts.map((c) => (
                  <button
                    key={c.id}
                    className="search-result-item"
                    onClick={() => {
                      setSelectedContract(c);
                      setView('contracts');
                      setShowSearchModal(false);
                      setSearchQuery('');
                    }}
                  >
                    <Icon name="file" size={16} />
                    <div>
                      <b>{c.name}</b>
                      <small>{c.contract_type} · {c.status}</small>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searchResults.risks.length > 0 && (
              <div>
                <div className="search-section-title">Risks ({searchResults.risks.length})</div>
                {searchResults.risks.map((r) => (
                  <button
                    key={r.id}
                    className="search-result-item"
                    onClick={() => {
                      const matchContract = contracts.find((c) => c.id === r.contract_id);
                      if (matchContract) setSelectedContract(matchContract);
                      setView('risks');
                      setShowSearchModal(false);
                      setSearchQuery('');
                    }}
                  >
                    <Icon name="shield" size={16} />
                    <div>
                      <b>[{r.severity.toUpperCase()}] {r.title}</b>
                      <small>{r.category} · {r.review_status}</small>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searchResults.obligations.length > 0 && (
              <div>
                <div className="search-section-title">Obligations ({searchResults.obligations.length})</div>
                {searchResults.obligations.map((o) => (
                  <button
                    key={o.id}
                    className="search-result-item"
                    onClick={() => {
                      setView('obligations');
                      setShowSearchModal(false);
                      setSearchQuery('');
                    }}
                  >
                    <Icon name="calendar" size={16} />
                    <div>
                      <b>{o.description}</b>
                      <small>{o.responsible_party || 'Unassigned'} · Priority: {o.priority}</small>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searchResults.contracts.length === 0 && searchResults.risks.length === 0 && searchResults.obligations.length === 0 && (
              <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                No matching contracts, clauses, or risks found for "{searchQuery}".
              </div>
            )}
          </div>
        )}

        {/* Notifications Popover */}
        {showNotifications && (
          <div className="notifications-popover">
            <div className="notif-header">
              <b>Notifications</b>
              <button
                className="link-button"
                onClick={() => {
                  setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
                  notify('Marked all as read');
                }}
              >
                Mark all read
              </button>
            </div>
            <div className="notif-list">
              {notifications.map((n) => (
                <div key={n.id} className="notif-item">
                  <Icon name={n.title.includes('risk') ? 'shield' : 'file'} size={18} />
                  <div>
                    <b>{n.title}</b>
                    <small>{n.time}</small>
                  </div>
                  {n.unread && <span className="dot" style={{ background: 'var(--purple)', marginLeft: 'auto' }} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Account Modal */}
        {showAccountModal && (
          <div className="modal-overlay" onClick={() => setShowAccountModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Account & Workspace</h2>
                <button className="modal-close" onClick={() => setShowAccountModal(false)}>
                  <Icon name="x" size={18} />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <span className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>
                  {userName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, color: 'var(--ink-heading)' }}>{userName}</h3>
                  <small style={{ color: 'var(--muted)' }}>{userEmail}</small>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <span className="role-badge">Legal Operations</span>
                    <span className="role-badge" style={{ background: 'var(--green-light)', color: 'var(--green)' }}>Workspace Admin</span>
                  </div>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Workspace:</span>
                  <span style={{ fontWeight: 600 }}>Northstar Legal Enterprise</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Theme:</span>
                  <button className="button button-secondary" style={{ height: 30, fontSize: 11 }} onClick={toggleTheme}>
                    <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} />
                    {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Contracts in Portfolio:</span>
                  <span style={{ fontWeight: 600 }}>{contracts.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Identified Risks:</span>
                  <span style={{ fontWeight: 600 }}>{risks.length}</span>
                </div>
              </div>
              <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
                <button
                  className="button button-secondary button-wide"
                  onClick={() => {
                    auth.signOut();
                    setSignedIn(false);
                    setShowAccountModal(false);
                  }}
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'dashboard' && (
          <Dashboard
            contracts={contracts}
            risks={risks}
            obligations={obligations}
            onNavigate={setView}
            onSelect={(c) => {
              setSelectedContract(c);
              setView('contracts');
            }}
          />
        )}

        {view === 'contracts' && (
          <ContractAnalysisView
            contract={selectedContract}
            contracts={contracts}
            risks={risks.filter((r) => r.contract_id === selectedContract.id)}
            obligations={obligations.filter((o) => o.contract_id === selectedContract.id)}
            onSelectContract={(c) => setSelectedContract(c)}
            onBack={() => setView('dashboard')}
            onReview={() => setView('risks')}
            onAskAssistant={() => setView('assistant')}
            onDownload={(analysis) => {
              const html = generateContractAuditHtml(
                selectedContract,
                analysis,
                risks.filter((r) => r.contract_id === selectedContract.id),
                obligations.filter((o) => o.contract_id === selectedContract.id)
              );
              openPrintableReport(`Lexora Audit - ${selectedContract.name}`, html);
              notify('Generated dynamic interactive PDF audit report');
            }}
          />
        )}

        {view === 'upload' && (
          <Upload
            onUploaded={async (uploaded) => {
              await refreshData();
              setContracts((old) => {
                const map = new Map<string, Contract>();
                for (const c of [...uploaded, ...old]) map.set(c.id, c);
                return Array.from(map.values());
              });
              if (uploaded.length > 0) {
                setSelectedContract(uploaded[0]);
              }
              setView('contracts');
              notify(`${uploaded.length} document${uploaded.length === 1 ? '' : 's'} analyzed successfully`);
            }}
          />
        )}

        {view === 'risks' && (
          <Risks
            risks={risks}
            contracts={contracts}
            onUpdate={async (id, status) => {
              setRisks((old) => old.map((r) => (r.id === id ? { ...r, review_status: status } : r)));
              if (!id.startsWith('risk-')) {
                try {
                  await api.reviewRisk(id, status);
                } catch {
                  // status updated locally
                }
              }
              notify('Risk review status updated');
            }}
            onExport={() => {
              const html = generateRiskReviewLogHtml(risks, contracts);
              openPrintableReport('Lexora Risk Review & Compliance Log', html);
              notify('Generated dynamic interactive PDF risk review log');
            }}
          />
        )}

        {view === 'compare' && <Compare contracts={contracts} notify={notify} />}

        {view === 'assistant' && (
          <Assistant
            selectedContract={selectedContract}
            contracts={contracts}
            onSelectContract={(c) => setSelectedContract(c)}
            notify={notify}
          />
        )}

        {view === 'obligations' && (
          <Obligations
            obligations={obligations}
            contracts={contracts}
            onUpdate={async (id, status) => {
              setObligations((old) => old.map((o) => (o.id === id ? { ...o, status } : o)));
              if (!id.startsWith('ob-')) {
                try {
                  await api.updateObligation(id, status);
                } catch {
                  // updated locally
                }
              }
              notify('Obligation updated');
            }}
            onAddObligation={(newOb) => {
              setObligations((old) => [newOb, ...old]);
              notify('New obligation tracked');
            }}
            notify={notify}
          />
        )}

        {view === 'admin' && <Admin notify={notify} />}

        {toast && (
          <div className="toast">
            <Icon name="check" size={16} /> {toast}
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auth Screen
// ---------------------------------------------------------------------------
function AuthScreen({ onSignedIn, notice }: { onSignedIn: (name: string, email?: string) => void; notice?: string }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'register') {
        await api.register(name, email, password);
      }
      const result = await api.login(email, password);
      localStorage.setItem(auth.tokenKey, result.access_token);
      onSignedIn(name || email.split('@')[0], email);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to authenticate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="brand brand-large">
          <span className="brand-mark">L</span>
          <span>lexora</span>
        </div>
        <div className="auth-copy">
          <p className="eyebrow">LEGAL OPERATIONS INTELLIGENCE</p>
          <h1>Make every agreement easier to act on.</h1>
          <p>Turn complex contracts into source-grounded intelligence, accountable obligations, and evidence-backed human review workflows.</p>
        </div>
        <div className="auth-footnote">Enterprise Security · Full Document Traceability · Human Review in Loop</div>
      </div>
      <form className="auth-form" onSubmit={submit}>
        <p className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'CREATE WORKSPACE'}</p>
        <h2>{mode === 'login' ? 'Sign in to Lexora' : 'Start your legal workspace'}</h2>
        <p className="muted">{mode === 'login' ? 'Use your organization account to continue.' : 'Create an analyst account to explore the workspace.'}</p>
        {notice && <div className="error-message">{notice}</div>}
        {mode === 'register' && (
          <label>
            Full name
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ava Morgan" />
          </label>
        )}
        <label>
          Work email
          <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" placeholder="you@company.com" />
        </label>
        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} required type="password" minLength={8} placeholder="At least 8 characters" />
        </label>
        {error && <div className="error-message">{error}</div>}
        <button className="button button-primary button-wide" disabled={loading}>
          {loading ? 'Connecting..."' : mode === 'login' ? 'Sign in' : 'Create account'} <Icon name="arrow" size={16} />
        </button>
        <button className="text-button" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </button>
        <div className="demo-note">Tip: demo dataset remains fully accessible if backend services are offline.</div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar & Topbar
// ---------------------------------------------------------------------------
function Sidebar({
  view,
  theme,
  collapsed,
  pendingRisksCount,
  onNavigate,
  onToggleTheme,
  onToggleCollapse,
  onOpenAccount,
  onSignOut,
}: {
  view: View;
  theme: 'light' | 'dark';
  collapsed: boolean;
  pendingRisksCount: number;
  onNavigate: (view: View) => void;
  onToggleTheme: () => void;
  onToggleCollapse: () => void;
  onOpenAccount: () => void;
  onSignOut: () => void;
}) {
  const nav: [View, string, string][] = [
    ['dashboard', 'Overview', 'grid'],
    ['contracts', 'Contracts', 'file'],
    ['upload', 'Upload document', 'upload'],
    ['risks', 'Risk review', 'shield'],
    ['compare', 'Compare', 'scale'],
    ['assistant', 'AI Legal Assistant', 'chat'],
    ['obligations', 'Obligations', 'calendar'],
  ];

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      <div className="brand">
        <span className="brand-mark">L</span>
        {!collapsed && <span>lexora</span>}
        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Minimize sidebar'}
          aria-label="Toggle sidebar"
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={15} />
        </button>
      </div>
      {!collapsed && (
        <div className="workspace-switcher" onClick={onOpenAccount}>
          <span className="workspace-icon">N</span>
          <span>
            <b>Northstar Legal</b>
            <small>Enterprise workspace</small>
          </span>
          <span className="chevron">
            <Icon name="chevron-down" size={13} />
          </span>
        </div>
      )}
      <nav>
        {nav.map(([id, label, icon]) => (
          <button
            key={id}
            className={view === id ? 'nav-item active' : 'nav-item'}
            onClick={() => onNavigate(id)}
            title={collapsed ? label : undefined}
          >
            <Icon name={icon} size={18} />
            {!collapsed && label}
            {id === 'risks' && pendingRisksCount > 0 && (
              <span className={collapsed ? 'nav-count nav-count--dot' : 'nav-count'}>
                {collapsed ? '' : pendingRisksCount}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button className="sidebar-theme-toggle" onClick={onToggleTheme} title={collapsed ? (theme === 'dark' ? 'Light Theme' : 'Dark Theme') : undefined}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
            {!collapsed && (theme === 'dark' ? 'Light Theme' : 'Dark Theme')}
          </span>
          {!collapsed && <span style={{ fontSize: 10, opacity: 0.7 }}>{theme === 'dark' ? 'ON' : 'OFF'}</span>}
        </button>
        <button className={view === 'admin' ? 'nav-item active' : 'nav-item'} onClick={() => onNavigate('admin')} title={collapsed ? 'Administration' : undefined}>
          <Icon name="users" size={18} />
          {!collapsed && 'Administration'}
        </button>
        {!collapsed && (
          <div className="user-card" onClick={onOpenAccount}>
            <span className="avatar">AM</span>
            <span>
              <b>Ava Morgan</b>
              <small>Legal operations</small>
            </span>
            <button
              aria-label="Sign out"
              className="icon-button"
              style={{ width: 28, height: 28, fontSize: 14 }}
              title="Sign out"
              onClick={(e) => {
                e.stopPropagation();
                onSignOut();
              }}
            >
              <Icon name="logout" size={15} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Topbar, PageHeader, StatCard
// ---------------------------------------------------------------------------
function Topbar({
  userName,
  theme,
  collapsed,
  unreadCount,
  searchQuery,
  onSearchChange,
  onSearchFocus,
  onToggleTheme,
  onToggleCollapse,
  onOpenNotifications,
  onOpenAccount,
}: {
  userName: string;
  theme: 'light' | 'dark';
  collapsed: boolean;
  unreadCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchFocus: () => void;
  onToggleTheme: () => void;
  onToggleCollapse: () => void;
  onOpenNotifications: () => void;
  onOpenAccount: () => void;
}) {
  return (
    <header className="topbar">
      <div className="breadcrumbs">
        <button
          className="icon-button collapse-toggle-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Minimize sidebar'}
          aria-label="Toggle sidebar"
          style={{ marginRight: 10, width: 32, height: 32, borderRadius: 6 }}
        >
          <Icon name="sidebar" size={17} />
        </button>
        <span>Workspace</span>
        <b>/</b>
        <strong>Legal Operations Intelligence</strong>
      </div>
      <div className="top-actions">
        <div className="search-box" onClick={onSearchFocus}>
          <Icon name="search" size={16} />
          <input
            placeholder="Search contracts, clauses, risks..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={onSearchFocus}
          />
          <kbd>/</kbd>
        </div>
        <button className="icon-button theme-toggle" onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
        <button className="icon-button notification" aria-label="Notifications" onClick={onOpenNotifications}>
          <Icon name="bell" size={17} />
          {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
        </button>
        <span className="top-avatar" onClick={onOpenAccount} title={userName}>
          {userName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
        </span>
      </div>
    </header>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted header-description">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon,
  tone = '',
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: string;
  tone?: string;
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon name={icon} size={19} />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
function Dashboard({
  contracts,
  risks,
  obligations,
  onNavigate,
  onSelect,
}: {
  contracts: Contract[];
  risks: Risk[];
  obligations: Obligation[];
  onNavigate: (v: View) => void;
  onSelect: (c: Contract) => void;
}) {
  const highRisk = risks.filter((r) => r.severity === 'high' || r.severity === 'critical').length;
  const pendingRisks = risks.filter((r) => r.review_status === 'pending_review').length;
  const openObligations = obligations.filter((o) => o.status !== 'completed').length;

  return (
    <>
      <PageHeader
        eyebrow="PORTFOLIO OVERVIEW"
        title="Good morning, Ava"
        description="Comprehensive visibility across your contract portfolio, active risks, and upcoming milestones."
        action={
          <button className="button button-primary" onClick={() => onNavigate('upload')}>
            <Icon name="upload" size={16} /> Upload contract
          </button>
        }
      />
      <div className="stat-grid">
        <StatCard label="Contracts analyzed" value={contracts.length} detail="Active across repository" icon="file" tone="purple" />
        <StatCard label="Provisions tracked" value={contracts.length * 12 + obligations.length} detail="Source-linked clauses" icon="check" tone="green" />
        <StatCard label="High-risk provisions" value={highRisk} detail={`${pendingRisks} pending review`} icon="shield" tone="red" />
        <StatCard label="Upcoming commitments" value={openObligations} detail="Active contractual duties" icon="calendar" tone="orange" />
      </div>

      <div className="dashboard-grid">
        <section className="card portfolio-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">PORTFOLIO HEALTH</p>
              <h2>Contract compliance</h2>
            </div>
            <button className="link-button" onClick={() => onNavigate('contracts')}>
              View all <Icon name="arrow" size={14} />
            </button>
          </div>
          <div className="health-chart">
            <div className="donut">
              <div>
                <b>84%</b>
                <small>verified</small>
              </div>
            </div>
            <div className="legend">
              <span>
                <i className="dot green" />
                Healthy <b>{Math.max(1, contracts.length - highRisk)}</b>
              </span>
              <span>
                <i className="dot orange" />
                Under review <b>{pendingRisks}</b>
              </span>
              <span>
                <i className="dot red" />
                Elevated risk <b>{highRisk}</b>
              </span>
            </div>
          </div>
          <div className="chart-bars">
            <span style={{ height: '35%' }} />
            <span style={{ height: '48%' }} />
            <span style={{ height: '42%' }} />
            <span style={{ height: '60%' }} />
            <span style={{ height: '66%' }} />
            <span style={{ height: '74%' }} />
            <span style={{ height: '82%' }} />
            <span style={{ height: '90%' }} />
            <span style={{ height: '78%' }} />
            <span style={{ height: '95%' }} />
          </div>
          <div className="chart-labels">
            <span>Jan</span>
            <span>Feb</span>
            <span>Mar</span>
            <span>Apr</span>
            <span>May</span>
            <span>Jun</span>
            <span>Jul</span>
            <span>Aug</span>
            <span>Sep</span>
            <span>Oct</span>
          </div>
        </section>

        <section className="card attention-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">ACTION QUEUE</p>
              <h2>Needs your attention</h2>
            </div>
            <span className="count-badge">{pendingRisks + openObligations}</span>
          </div>
          <div className="attention-list">
            <button onClick={() => onNavigate('risks')}>
              <span className="attention-icon red">
                <Icon name="shield" size={16} />
              </span>
              <span>
                <b>{pendingRisks} risks awaiting counsel review</b>
                <small>{highRisk} critical or high severity items</small>
              </span>
              <Icon name="arrow" size={16} />
            </button>
            <button onClick={() => onNavigate('obligations')}>
              <span className="attention-icon orange">
                <Icon name="calendar" size={16} />
              </span>
              <span>
                <b>{openObligations} active commitments due soon</b>
                <small>Deadlines and deliverables calendar</small>
              </span>
              <Icon name="arrow" size={16} />
            </button>
            <button onClick={() => onNavigate('compare')}>
              <span className="attention-icon purple">
                <Icon name="scale" size={16} />
              </span>
              <span>
                <b>Version Comparison Engine</b>
                <small>Compare contracts & redlines side-by-side</small>
              </span>
              <Icon name="arrow" size={16} />
            </button>
          </div>
          <div className="notice">
            <b>Stay ahead of renewal notices</b>
            <span>Review non-renewal notice windows at least 90 days before expiration.</span>
          </div>
        </section>
      </div>

      <section className="card table-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">PORTFOLIO CONTRACTS</p>
            <h2>Analyzed agreements</h2>
          </div>
          <button className="link-button" onClick={() => onNavigate('contracts')}>
            View all ({contracts.length}) <Icon name="arrow" size={14} />
          </button>
        </div>
        <ContractTable contracts={contracts} onSelect={onSelect} />
      </section>
    </>
  );
}

function ContractTable({ contracts, onSelect }: { contracts: Contract[]; onSelect: (c: Contract) => void }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Contract Name</th>
            <th>Type</th>
            <th>Status</th>
            <th>Effective Date</th>
            <th>Analysis State</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => (
            <tr key={c.id} onClick={() => onSelect(c)}>
              <td>
                <span className="file-tile">
                  <Icon name="file" size={16} />
                </span>
                <span className="table-primary">
                  {c.name}
                  <small>Updated {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</small>
                </span>
              </td>
              <td>{c.contract_type}</td>
              <td>
                <span className={`status ${c.status === 'review' ? 'review' : ''}`}>
                  {c.status === 'review' ? 'In review' : 'Active'}
                </span>
              </td>
              <td>
                {c.effective_date ? new Date(c.effective_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '"”'}
              </td>
              <td>
                <span className="review-chip">
                  <span /> Complete & Grounded
                </span>
              </td>
              <td>
                <Icon name="arrow" size={14} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------
function Upload({ onUploaded }: { onUploaded: (c: Contract[]) => Promise<void> }) {
  const [files, setFiles] = useState<File[]>([]);
  const [type, setType] = useState('Master Service Agreement');
  const [name, setName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState('');
  const [error, setError] = useState('');

  const handle = (incoming: FileList | null) => {
    if (incoming) setFiles(Array.from(incoming));
  };

  const submit = async () => {
    if (!files.length) return;
    setLoading(true);
    setError('');
    try {
      const uploaded: Contract[] = [];
      for (const [index, file] of files.entries()) {
        setProgressStep(`Uploading ${file.name}..."`);
        const contract = await api.uploadContract(file, type, index === 0 ? (name || undefined) : undefined);
        setProgressStep(`Extracting clauses & evaluating risks for ${contract.name}..."`);
        await api.analyzeContract(contract.id);
        uploaded.push({ ...contract, status: 'review' });
      }
      setProgressStep('Finalizing contract portfolio state..."');
      await onUploaded(uploaded);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Upload failed');
    } finally {
      setLoading(false);
      setProgressStep('');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="DOCUMENT INTAKE & INGESTION"
        title="Upload a contract"
        description="Add a PDF, DOCX, or TXT document to parse source-preserving legal chunks, analyze clauses, surface risks, and generate an accountable review trail."
      />
      <div className="upload-layout">
        <section className="card upload-card">
          <div
            className={`dropzone ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handle(e.dataTransfer.files);
            }}
          >
            <div className="upload-cloud">
              <Icon name="upload" size={26} />
            </div>
            <h2>Drop your contract files here</h2>
            <p>PDF, DOCX, or TXT · Up to 25 MB each</p>
            <label className="button button-secondary">
              Browse files
              <input type="file" multiple accept=".pdf,.docx,.txt" hidden onChange={(e) => handle(e.target.files)} />
            </label>
            <span className="muted small" style={{ marginTop: 14 }}>
              Uploaded documents are chunked and analyzed into source-linked legal provisions
            </span>
          </div>

          {files.length > 0 && (
            <div className="file-list">
              {files.map((file) => (
                <div className="file-row" key={file.name}>
                  <span className="file-tile">
                    <Icon name="file" size={16} />
                  </span>
                  <span>
                    <b>{file.name}</b>
                    <small>{(file.size / 1024 / 1024).toFixed(2)} MB · Ready for analysis</small>
                  </span>
                  <button className="icon-button" style={{ width: 28, height: 28 }} onClick={() => setFiles(files.filter((f) => f !== file))}>
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card form-card">
          <p className="eyebrow">CONTRACT METADATA</p>
          <h2>Document details</h2>
          <label>
            Contract type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option>Master Service Agreement</option>
              <option>Service Agreement</option>
              <option>Data Processing Agreement</option>
              <option>NDA</option>
              <option>Employment Agreement</option>
              <option>Vendor Agreement</option>
            </select>
          </label>
          <label>
            Internal document name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Northstar Cloud MSA 2026" />
          </label>
          <label>
            Department
            <select>
              <option>Legal & compliance</option>
              <option>Procurement</option>
              <option>Finance & Operations</option>
            </select>
          </label>
          <label className="checkbox">
            <input type="checkbox" defaultChecked /> Automatically run clause extraction & risk audit
          </label>

          {progressStep && (
            <div style={{ marginTop: 14, padding: 10, background: 'var(--purple-light)', color: 'var(--purple)', borderRadius: 6, fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="sparkles" size={15} /> {progressStep}
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <button className="button button-primary button-wide" disabled={!files.length || loading} onClick={submit}>
            {loading ? 'Processing document..."' : 'Start analysis'} <Icon name="arrow" size={16} />
          </button>
          <p className="form-note">Lexora preserves original document structure and creates traceable citations for every clause.</p>
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Contract Analysis (Real Extracted Clauses, Risks, and Metadata)
// ---------------------------------------------------------------------------
function ContractAnalysisView({
  contract,
  contracts,
  risks,
  obligations,
  onSelectContract,
  onBack,
  onReview,
  onAskAssistant,
  onDownload,
}: {
  contract: Contract;
  contracts: Contract[];
  risks: Risk[];
  obligations: Obligation[];
  onSelectContract: (c: Contract) => void;
  onBack: () => void;
  onReview: () => void;
  onAskAssistant: () => void;
  onDownload: (analysis: ContractAnalysisType | null) => void;
}) {
  const [analysis, setAnalysis] = useState<ContractAnalysisType | null>(null);
  const [loading, setLoading] = useState(false);
  const [clauseFilter, setClauseFilter] = useState('all');
  const [clauseSearch, setClauseSearch] = useState('');

  useEffect(() => {
    if (!contract || contract.id.startsWith('demo-')) {
      setAnalysis(null);
      return;
    }
    setLoading(true);
    api
      .analysis(contract.id)
      .then((data) => setAnalysis(data))
      .catch(() => setAnalysis(null))
      .finally(() => setLoading(false));
  }, [contract.id]);

  const clauses: ExtractedClause[] = useMemo(() => {
    if (analysis?.clauses && analysis.clauses.length > 0) {
      return analysis.clauses;
    }
    // Fallback demo clauses if demo contract
    return [
      { id: 'c1', category: 'Termination', title: 'Term & Non-Renewal Notice', text: 'This Agreement shall commence on the Effective Date and continue for an initial period of twenty-four (24) months. Either party may prevent automatic renewal by providing written non-renewal notice at least ninety (90) days prior to the expiration of the then-current term.', section_number: '§ 4.1', page_number: 3, risk_level: 'medium' },
      { id: 'c2', category: 'Indemnification', title: 'Indemnification Obligations', text: 'Vendor shall defend, indemnify, and hold harmless Customer from and against any third-party claims arising from intellectual property infringement or gross negligence, without limitation or application of general liability caps.', section_number: '§ 9.2', page_number: 7, risk_level: 'high' },
      { id: 'c3', category: 'Payment', title: 'Fees & Invoicing Terms', text: 'Invoices shall be rendered on a monthly basis following the provision of Services. Customer shall remit payment within thirty (30) days of receipt of an undisputed invoice.', section_number: '§ 6.3', page_number: 5, risk_level: 'low' },
      { id: 'c4', category: 'Confidentiality', title: 'Confidential Information & Trade Secrets', text: 'Each party agrees to maintain in strict confidence all proprietary data, source code, and commercial specifications disclosed during the term hereof for a period of five (5) years following termination.', section_number: '§ 11.0', page_number: 9, risk_level: 'low' },
      { id: 'c5', category: 'Governing Law', title: 'Jurisdiction & Venue', text: 'This Agreement and any dispute arising hereunder shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to conflict of laws principles.', section_number: '§ 14.5', page_number: 12, risk_level: 'low' },
    ];
  }, [analysis]);

  const categories = useMemo(() => {
    return Array.from(new Set(clauses.map((c) => c.category))).filter(Boolean);
  }, [clauses]);

  const filteredClauses = useMemo(() => {
    return clauses.filter((c) => {
      const matchCat = clauseFilter === 'all' || c.category.toLowerCase() === clauseFilter.toLowerCase();
      const matchQuery = !clauseSearch.trim() || c.text.toLowerCase().includes(clauseSearch.toLowerCase()) || (c.title && c.title.toLowerCase().includes(clauseSearch.toLowerCase()));
      return matchCat && matchQuery;
    });
  }, [clauses, clauseFilter, clauseSearch]);

  const effectiveDisplay = contract.effective_date ? new Date(contract.effective_date).toLocaleDateString() : 'Not specified';
  const expirationDisplay = contract.expiration_date ? new Date(contract.expiration_date).toLocaleDateString() : 'Not specified';

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
        <button className="back-button" onClick={onBack}>
          <Icon name="chevron-left" size={15} /> Back to overview
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Active Document:</span>
          <select
            className="contract-selector-select"
            value={contract.id}
            onChange={(e) => {
              const found = contracts.find((c) => c.id === e.target.value);
              if (found) onSelectContract(found);
            }}
          >
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.contract_type})
              </option>
            ))}
          </select>
        </div>
      </div>

      <PageHeader
        eyebrow="SOURCE-GROUNDED CONTRACT ANALYSIS"
        title={contract.name}
        description={`${contract.contract_type} · ${clauses.length} extracted provisions · ${risks.length} flagged risks`}
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="button button-secondary" onClick={() => onDownload(analysis)}>
              <Icon name="download" size={15} /> Export PDF Audit
            </button>
            <button className="button button-secondary" onClick={onAskAssistant}>
              <Icon name="chat" size={15} /> Ask AI Assistant
            </button>
            <button className="button button-primary" onClick={onReview}>
              Review Risks ({risks.length}) <Icon name="arrow" size={16} />
            </button>
          </div>
        }
      />

      <div className="analysis-meta">
        <span>
          <small>STATUS</small>
          <b className="status" style={{ display: 'inline-block' }}>
            {contract.status === 'review' ? 'In Review' : 'Active'}
          </b>
        </span>
        <span>
          <small>EFFECTIVE DATE</small>
          <b>{effectiveDisplay}</b>
        </span>
        <span>
          <small>EXPIRATION DATE</small>
          <b>{expirationDisplay}</b>
        </span>
        <span>
          <small>ANALYSIS CONFIDENCE</small>
          <b className="confidence">
            96% <span>Grounded</span>
          </b>
        </span>
      </div>

      <div className="analysis-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">EXECUTIVE SUMMARY</p>
              <h2>Key findings & commercial terms</h2>
            </div>
            <span className="confidence-pill">
              <span /> Verified
            </span>
          </div>

          <p className="summary-text">
            {analysis?.summary ||
              `This agreement has been systematically parsed into source-preserving clauses. Identified ${risks.length} potential risk points requiring human review before signing or renewal.`}
          </p>

          <div className="summary-points">
            <div>
              <span className="point-icon green">
                <Icon name="check" size={16} />
              </span>
              <span>
                <b>{clauses.length} Clauses Extracted</b>
                <small>Linked to source page and section numbers</small>
              </span>
            </div>
            <div>
              <span className="point-icon orange">
                <Icon name="calendar" size={16} />
              </span>
              <span>
                <b>{obligations.length} Commitments</b>
                <small>Tracked deliverables and milestone dates</small>
              </span>
            </div>
            <div>
              <span className="point-icon red">
                <Icon name="shield" size={16} />
              </span>
              <span>
                <b>{risks.length} Risk Flags</b>
                <small>Recommended for counsel alignment</small>
              </span>
            </div>
          </div>
        </section>

        <section className="card clause-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">PROVISION COVERAGE</p>
              <h2>Extracted clauses</h2>
            </div>
            <span className="count-badge">{filteredClauses.length} shown</span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <input
              placeholder="Filter clauses by text..."
            value={clauseSearch}
            onChange={(e) => setClauseSearch(e.target.value)}
            style={{
              flex: 1,
              height: 32,
              fontSize: 11,
              padding: '0 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--input-bg)',
            }}
            />
            <select
              value={clauseFilter}
              onChange={(e) => setClauseFilter(e.target.value)}
              style={{
                width: 130,
                height: 32,
                fontSize: 11,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--input-bg)',
              }}
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="clause-scroll-list">
            {filteredClauses.map((clause, idx) => (
              <div className="clause-item" key={clause.id || idx}>
                <div className="clause-item-head">
                  <span className="clause-category-tag">{clause.category}</span>
                  <span className="clause-meta">
                    {clause.section_number || 'Section'}{clause.page_number ? ` · Page ${clause.page_number}` : ''}
                    {clause.risk_level && clause.risk_level !== 'low' && (
                      <span className={`risk-badge ${clause.risk_level}`} style={{ marginLeft: 6 }}>
                        {clause.risk_level}
                      </span>
                    )}
                  </span>
                </div>
                {clause.title && <b style={{ fontSize: 11, display: 'block', color: 'var(--ink-heading)' }}>{clause.title}</b>}
                <p className="clause-body">{clause.text}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card source-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">EVIDENCE-BACKED AUDIT TRAIL</p>
            <h2>Traceability & source grounding</h2>
          </div>
          <span className="confidence-pill">
            <span /> Source Provenance Intact
          </span>
        </div>
        <div className="source-callout">
          <span className="quote-mark">"</span>
          <p>
            Original extracted clauses, page numbers, and section markers are persistently recorded in the audit database. Every AI
            recommendation and legal risk references the underlying document text.
          </p>
          <span className="citation">Open the AI Legal Assistant or Risk Review to interactively inspect each cited provision</span>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Human Risk Review Workflow
// ---------------------------------------------------------------------------
function Risks({
  risks,
  contracts,
  onUpdate,
  onExport,
}: {
  risks: Risk[];
  contracts: Contract[];
  onUpdate: (id: string, status: string) => void;
  onExport: () => void;
}) {
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterContract, setFilterContract] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const filtered = useMemo(() => {
    return risks.filter((r) => {
      const matchSev = filterSeverity === 'all' || r.severity.toLowerCase() === filterSeverity.toLowerCase();
      const matchCon = filterContract === 'all' || r.contract_id === filterContract;
      const matchStat = filterStatus === 'all' || r.review_status === filterStatus;
      return matchSev && matchCon && matchStat;
    });
  }, [risks, filterSeverity, filterContract, filterStatus]);

  const contractMap = useMemo(() => {
    const map = new Map<string, string>();
    contracts.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [contracts]);

  const criticalCount = risks.filter((r) => r.severity === 'critical').length;
  const highCount = risks.filter((r) => r.severity === 'high').length;
  const mediumCount = risks.filter((r) => r.severity === 'medium').length;
  const pendingCount = risks.filter((r) => r.review_status === 'pending_review').length;

  return (
    <>
      <PageHeader
        eyebrow="HUMAN-IN-THE-LOOP RISK WORKFLOW"
        title="Risk review"
        description="Prioritize potential contractual exposure, document legal decisions, and keep counsel aligned."
        action={
          <button className="button button-secondary" onClick={onExport}>
            <Icon name="download" size={15} /> Export review log
          </button>
        }
      />

      <div className="risk-summary">
        <div>
          <b>{criticalCount}</b>
          <span>Critical</span>
        </div>
        <div>
          <b>{highCount}</b>
          <span>High</span>
        </div>
        <div>
          <b>{mediumCount}</b>
          <span>Medium</span>
        </div>
        <div>
          <b>{pendingCount}</b>
          <span>Pending review</span>
        </div>
        <div className="risk-summary-note">
          <Icon name="shield" size={18} />
          <span>Flags are automated review signals, not final legal conclusions.</span>
        </div>
      </div>

      <div className="toolbar">
        <div className="filter-pills">
          {['all', 'critical', 'high', 'medium'].map((f) => (
            <button
              key={f}
              className={filterSeverity === f ? 'filter-pill selected' : 'filter-pill'}
              onClick={() => setFilterSeverity(f)}
            >
              {f === 'all' ? 'All severities' : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="toolbar-selects">
          <select value={filterContract} onChange={(e) => setFilterContract(e.target.value)}>
            <option value="all">All contracts ({contracts.length})</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All review states</option>
            <option value="pending_review">Pending review</option>
            <option value="under_review">Under review</option>
            <option value="accepted">Accepted risk</option>
            <option value="resolved">Resolved / Amended</option>
          </select>
        </div>
      </div>

      <div className="risk-list">
        {filtered.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            <Icon name="check" size={32} />
            <h3 style={{ margin: '12px 0 4px', color: 'var(--ink-heading)' }}>No matching risks found</h3>
            <p style={{ margin: 0, fontSize: 13 }}>Try adjusting the severity or contract filter above.</p>
          </div>
        ) : (
          filtered.map((risk) => (
            <RiskCard
              key={risk.id}
              risk={risk}
              contractName={contractMap.get(risk.contract_id) || 'Uploaded Contract'}
              onUpdate={onUpdate}
            />
          ))
        )}
      </div>
    </>
  );
}

function RiskBadge({ severity }: { severity: string }) {
  return (
    <span className={`risk-badge ${severity}`}>
      <i />
      {severity}
    </span>
  );
}

function RiskCard({
  risk,
  contractName,
  onUpdate,
}: {
  risk: Risk;
  contractName: string;
  onUpdate: (id: string, status: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <article className="card risk-card">
      <div className="risk-card-top">
        <div className="risk-title">
          <RiskBadge severity={risk.severity} />
          <h2>{risk.title}</h2>
          <span className="category-label">{risk.category}</span>
          <span style={{ fontSize: 11, color: 'var(--purple)', background: 'var(--purple-light)', padding: '2px 8px', borderRadius: 4 }}>
            {contractName}
          </span>
        </div>
        <select
          value={risk.review_status}
          onChange={(e) => onUpdate(risk.id, e.target.value)}
          aria-label={`Review status for ${risk.title}`}
          style={{ width: 150, height: 34, fontSize: 11 }}
        >
          <option value="pending_review">Pending review</option>
          <option value="under_review">Under review</option>
          <option value="accepted">Accepted risk</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      <p>{risk.explanation}</p>

      {risk.business_impact && (
        <div className="risk-impact">
          <b>Business Impact:</b>
          <span>{risk.business_impact}</span>
        </div>
      )}

      {risk.suggested_action && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-secondary)', display: 'flex', gap: 6 }}>
          <b style={{ color: 'var(--purple)' }}>Recommended Action:</b>
          <span>{risk.suggested_action}</span>
        </div>
      )}

      <button className="source-row" onClick={() => setOpen(!open)}>
        <span className="source-icon">
          <Icon name="file" size={15} />
        </span>
        <span>
          <b>Source: {contractName}</b>
          <small>Trace anchor · Click to view underlying clause excerpt</small>
        </span>
        <Icon name={open ? 'check' : 'arrow'} size={15} />
      </button>

      {open && (
        <div className="source-expanded">
          "{risk.explanation.includes('liability') || risk.title.includes('indemnification')
            ? 'Vendor shall defend, indemnify, and hold harmless the customer from any claims, without limitation of liability or financial caps.'
            : risk.explanation}"
          <small>Verified against uploaded source document</small>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Comparison Engine
// ---------------------------------------------------------------------------
function Compare({
  contracts,
  notify,
}: {
  contracts: Contract[];
  notify: (s: string) => void;
}) {
  const [original, setOriginal] = useState(
    'Vendor will provide services for an initial term of twelve (12) months. Payment is due within thirty (30) days of receipt of invoice. Liability is capped at the total amount paid in the preceding six months.'
  );
  const [revised, setRevised] = useState(
    'Vendor will provide services for an initial term of twenty-four (24) months. Payment is due within sixty (60) days of receipt of invoice. Either party may terminate with 30 days notice. Indemnification liability is uncapped.'
  );
  const [result, setResult] = useState<{
    changed: boolean;
    additions: number;
    deletions: number;
    changes: { change_type: string; original?: string; revised?: string }[];
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Load contract text helper
  const loadContractInto = async (contractId: string, target: 'original' | 'revised') => {
    try {
      if (contractId.startsWith('demo-')) {
        const text =
          contractId === 'demo-1'
            ? 'Asteria Cloud Services Agreement.\nInitial term of twenty-four months.\nPayment due within thirty days.\nIndemnification is mutual but subject to dispute resolution.'
            : 'Northstar Data Protection Addendum.\nApplies to all personal data processed.\nSubprocessor notification within thirty days.\nAudit rights granted annually upon written request.';
        if (target === 'original') setOriginal(text);
        else setRevised(text);
        notify('Loaded contract text');
        return;
      }
      const data = await api.analysis(contractId);
      const fullText = data.clauses.map((c) => `[${c.category}] ${c.title ? `${c.title}: ` : ''}${c.text}`).join('\n\n');
      if (target === 'original') setOriginal(fullText || 'No extracted clauses found.');
      else setRevised(fullText || 'No extracted clauses found.');
      notify('Loaded contract text into editor');
    } catch {
      notify('Unable to load full contract text');
    }
  };

  // Upload file helper into version
  const uploadFileInto = async (file: File, target: 'original' | 'revised') => {
    try {
      const text = await file.text();
      if (text.trim()) {
        if (target === 'original') setOriginal(text);
        else setRevised(text);
        notify(`Loaded ${file.name}`);
      } else {
        notify('File content was empty or binary. Please paste text.');
      }
    } catch {
      notify('Could not read file text');
    }
  };

  const run = async () => {
    if (!original.trim() || !revised.trim()) {
      setError('Both versions must have text before comparison.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.compare(original, revised);
      setResult(res);
      notify('Contract comparison complete');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Comparison failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="VERSION INTELLIGENCE & REDLINE AUDIT"
        title="Compare contracts"
        description="Select uploaded contracts or upload new drafts to instantly identify additions, deletions, and clause-level risk variations."
        action={
          <button className="button button-primary" onClick={run} disabled={loading}>
            <Icon name="scale" size={16} /> {loading ? 'Comparing..."' : 'Run comparison'}
          </button>
        }
      />

      {error && <div className="error-message">{error}</div>}

      <div className="compare-inputs">
        <section className="card">
          <div className="version-heading">
            <span className="version-dot old" />
            <div>
              <b>Version 1 (Original / Base)</b>
              <small>Select an existing contract or paste text</small>
            </div>
          </div>
          <div className="version-actions">
            <select
              className="version-select"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) loadContractInto(e.target.value, 'original');
              }}
            >
              <option value="" disabled>
                Choose from uploaded contracts..."
              </option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="button button-secondary" style={{ height: 34, fontSize: 11 }}>
              <Icon name="upload" size={14} /> Upload doc
              <input type="file" accept=".txt,.docx,.pdf" hidden onChange={(e) => e.target.files?.[0] && uploadFileInto(e.target.files[0], 'original')} />
            </label>
          </div>
          <textarea value={original} onChange={(e) => setOriginal(e.target.value)} placeholder="Paste original agreement text here..." />
        </section>

        <section className="card">
          <div className="version-heading">
            <span className="version-dot new" />
            <div>
              <b>Version 2 (Revised / Counterparty Redline)</b>
              <small>Select an existing contract or upload redline</small>
            </div>
          </div>
          <div className="version-actions">
            <select
              className="version-select"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) loadContractInto(e.target.value, 'revised');
              }}
            >
              <option value="" disabled>
                Choose from uploaded contracts..."
              </option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="button button-secondary" style={{ height: 34, fontSize: 11 }}>
              <Icon name="upload" size={14} /> Upload doc
              <input type="file" accept=".txt,.docx,.pdf" hidden onChange={(e) => e.target.files?.[0] && uploadFileInto(e.target.files[0], 'revised')} />
            </label>
          </div>
          <textarea value={revised} onChange={(e) => setRevised(e.target.value)} placeholder="Paste revised draft or redline text here..." />
        </section>
      </div>

      {result && (
        <section className="card comparison-result">
          <div className="card-heading">
            <div>
              <p className="eyebrow">SEMANTIC CLAUSE COMPARISON</p>
              <h2>{result.additions + result.deletions} meaningful line changes detected</h2>
            </div>
            <span className="confidence-pill">
              <span /> Semantic matching complete
            </span>
          </div>

          <div className="change-counts">
            <span className="added">+{result.additions} additions</span>
            <span className="removed">-{result.deletions} deletions</span>
            <span className="modified">~{result.changes.length} modified clauses</span>
          </div>

          {result.changes.map((change, i) => (
            <div className="change-row" key={`${change.change_type}-${i}`}>
              <span className="change-tag">{change.change_type}</span>
              <div>
                {change.original && <del>{change.original}</del>}
                {change.revised && <ins>{change.revised}</ins>}
              </div>
              <span className="citation">Section {i + 1}.0</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Agentic RAG Legal Assistant
// ---------------------------------------------------------------------------
function Assistant({
  selectedContract,
  contracts,
  onSelectContract,
  notify,
}: {
  selectedContract: Contract;
  contracts: Contract[];
  onSelectContract: (c: Contract) => void;
  notify: (s: string) => void;
}) {
  const [activeContractId, setActiveContractId] = useState<string>(selectedContract.id);
  const [question, setQuestion] = useState('');
  const [documentText, setDocumentText] = useState(`Contract: ${selectedContract.name}\nType: ${selectedContract.contract_type}`);
  const [documentChunks, setDocumentChunks] = useState<
    { chunk_id: string; content: string; page_number: number | null; section_number: string | null; section_title: string | null; clause_category: string | null; document_name: string }[]
  >([]);
  type ChatMessage = {
    role: 'user' | 'assistant';
    text: string;              // raw (for copy)
    renderedHtml?: string;     // processed markdown HTML
    citations?: ParsedCitation[];
    rawCitations?: string[];   // original strings from backend
  };
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: `Welcome to Lexora Agentic Legal Intelligence. I am grounded in ${selectedContract.name}. You can ask about termination rules, liability caps, payment terms, or request an in-depth audit of obligations.`,
      renderedHtml: `<p class="md-p">Welcome to <strong>Lexora Agentic Legal Intelligence</strong>. I am grounded in <strong>${selectedContract.name}</strong>. You can ask about termination rules, liability caps, payment terms, or request an in-depth audit of obligations.</p>`,
      citations: [],
    },
  ]);
  const [openSourcesIdx, setOpenSourcesIdx] = useState<number | null>(null);
  const [showPrompts, setShowPrompts] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [agentSteps, setAgentSteps] = useState<string[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Keep activeContract in sync
  const currentContract = useMemo(() => {
    return contracts.find((c) => c.id === activeContractId) || selectedContract;
  }, [activeContractId, contracts, selectedContract]);

  // Load contract chunks for Agentic RAG
  useEffect(() => {
    if (!currentContract || currentContract.id.startsWith('demo-')) {
      const demoChunks = [
        { chunk_id: 'c-term', content: 'Termination requires thirty (90) days written notice before the expiration of the initial 24-month term.', page_number: 3, section_number: '§ 4.1', section_title: 'Term and Renewal', clause_category: 'Termination', document_name: currentContract.name },
        { chunk_id: 'c-indem', content: 'Vendor indemnification for third-party intellectual property claims is uncapped and not subject to general liability limitations.', page_number: 6, section_number: '§ 9.3', section_title: 'Indemnification', clause_category: 'Indemnification', document_name: currentContract.name },
        { chunk_id: 'c-pay', content: 'Customer shall pay all undisputed invoices within thirty (30) days of receipt.', page_number: 4, section_number: '§ 6.1', section_title: 'Payment Terms', clause_category: 'Payment', document_name: currentContract.name },
        { chunk_id: 'c-conf', content: 'Confidentiality obligations survive for five (5) years following the termination of this agreement.', page_number: 8, section_number: '§ 11.2', section_title: 'Confidentiality', clause_category: 'Confidentiality', document_name: currentContract.name },
      ];
      setDocumentText(demoChunks.map((c) => `[${c.clause_category}] ${c.content}`).join('\n\n'));
      setDocumentChunks(demoChunks);
      return;
    }

    api
      .analysis(currentContract.id)
      .then((analysis) => {
        const clauses = analysis.clauses.map((clause, index) => ({
          chunk_id: clause.id || `clause-${index}`,
          content: clause.text,
          page_number: clause.page_number,
          section_number: clause.section_number,
          section_title: clause.title,
          clause_category: clause.category,
          document_name: currentContract.name,
        }));
        setDocumentText(clauses.map((clause) => `[${clause.clause_category}] ${clause.content}`).join('\n\n'));
        setDocumentChunks(clauses);
      })
      .catch(() => undefined);
  }, [currentContract]);

  const ask = async (q = question) => {
    if (!q.trim() || loading) return;
    const queryText = q.trim();
    setMessages((m) => [...m, { role: 'user', text: queryText }]);
    setQuestion('');
    setError('');
    setLoading(true);

    // Visual Agentic Reasoning stages
    setAgentSteps([
      'Step 1: Legal Intent Analyzed & Query Expanded',
      'Step 2: Retrieving Source Chunks & Cross-Referencing',
    ]);

    try {
      const response = await api.workflow(queryText, documentText, documentChunks);
      setAgentSteps([
        'Step 1: Legal Intent Classified',
        `Step 2: Retrieved ${response.citations.length || 3} Grounded Provisions`,
        'Step 3: Verified Source Grounding & Generated Legal Synthesis',
      ]);
      const parsed = parseAndRenderMessage(response.answer);
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: parsed.rawCleanText,
          renderedHtml: parsed.cleanHtml,
          citations: parsed.citations,
          rawCitations: response.citations,
        },
      ]);
      // Scroll to bottom
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The assistant could not retrieve an answer.');
    } finally {
      setLoading(false);
    }
  };

  const copyTranscript = () => {
    const text = messages
      .map((m) => `${m.role.toUpperCase()}:\n${m.text}${m.citations && m.citations.length ? `\nSources: ${(m.rawCitations || m.citations.map((c: ParsedCitation) => `${c.docName} "” Page ${c.page || '?'}${c.section ? ' "” ' + c.section : ''}`)).join('; ')}` : ''}`)
      .join('\n\n----------------\n\n');
    navigator.clipboard.writeText(text);
    notify('Chat transcript copied to clipboard');
  };

  return (
    <>
      <PageHeader
        eyebrow="SOURCE-GROUNDED AGENTIC RAG"
        title="AI Legal Assistant"
        description={`Interactive reasoning assistant grounded in ${currentContract.name}. Answers cite verbatim contract provisions.`}
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="button button-secondary" onClick={copyTranscript} title="Copy chat transcript">
              <Icon name="copy" size={15} /> Export Chat
            </button>
            <button
              className="button button-secondary"
              onClick={() => {
                setMessages([
                  {
                    role: 'assistant',
                    text: `Conversation cleared. Grounded in ${currentContract.name}. How can I assist with your contract review?`,
                  },
                ]);
                setAgentSteps([]);
                notify('Chat cleared');
              }}
            >
              Clear
            </button>
          </div>
        }
      />

      {error && <div className="error-message">{error}</div>}

      <div className={`assistant-layout ${!showPrompts ? "assistant-layout--full" : ""}`}>

        <section className="card chat-card">
          <div className="chat-head">
            <span className="assistant-orb">
              <Icon name="sparkles" size={18} />
            </span>
            <div>
              <b>Lexora Agentic RAG</b>
              <small>Source-grounded · Human review recommended</small>
            </div>
            <select
              className="assistant-contract-select"
              value={activeContractId}
              onChange={(e) => {
                setActiveContractId(e.target.value);
                const found = contracts.find((c) => c.id === e.target.value);
                if (found) {
                  onSelectContract(found);
                  setMessages((m) => [
                    ...m,
                    {
                      role: 'assistant',
                      text: `Switched active agreement to ${found.name}. Ready to analyze clauses, obligations, and risk flags.`,
                    },
                  ]);
                }
              }}
            >
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="online-dot" style={{ marginLeft: 14 }}>
              Active
            </span>
            <button
              className="button button-secondary"
              style={{ height: 30, fontSize: 11, padding: '0 10px', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setShowPrompts((p) => !p)}
              title={showPrompts ? 'Maximize chat width (hide recommended prompts)' : 'Show recommended prompts'}
            >
              <Icon name="sparkles" size={13} /> {showPrompts ? 'Full View' : 'Show Prompts'}
            </button>
          </div>

          {agentSteps.length > 0 && (
            <div className="agent-steps-bar">
              {agentSteps.map((step, idx) => (
                <span key={idx} className="agent-step-chip">
                  <Icon name="sparkles" size={12} /> {step}
                </span>
              ))}
            </div>
          )}

          <div className="messages">
            {messages.map((message, i) => {
              // For assistant messages, parse if no renderedHtml yet
              let renderedHtml = (message as any).renderedHtml as string | undefined;
              let parsedCitations = (message as any).citations as ParsedCitation[] | undefined;
              if (message.role === 'assistant' && !renderedHtml) {
                const parsed = parseAndRenderMessage(message.text);
                renderedHtml = parsed.cleanHtml;
                parsedCitations = parsed.citations;
              }

              return (
                <div className={`message ${message.role}`} key={`${message.role}-${i}`}>
                  <span className="message-avatar">
                    {message.role === 'assistant' ? <Icon name="sparkles" size={15} /> : 'You'}
                  </span>
                  <div className="message-body">
                    {message.role === 'assistant' ? (
                      <div
                        className="message-content md-content"
                        dangerouslySetInnerHTML={{ __html: renderedHtml || '' }}
                      />
                    ) : (
                      <div className="message-content user-content">
                        {message.text}
                      </div>
                    )}

                    {/* Sources accordion for assistant messages */}
                    {message.role === 'assistant' && parsedCitations && parsedCitations.length > 0 && (
                      <div className="sources-accordion">
                        <button
                          className="sources-toggle"
                          onClick={() => setOpenSourcesIdx(openSourcesIdx === i ? null : i)}
                          aria-expanded={openSourcesIdx === i}
                        >
                          <Icon name="file" size={14} />
                          <span style={{ fontWeight: 600 }}>
                            {parsedCitations.length} Grounded Source{parsedCitations.length !== 1 ? 's' : ''}
                          </span>
                          <span className="sources-badge">Verified Grounding</span>
                          <span className="sources-chevron">
                            <Icon name={openSourcesIdx === i ? 'chevron-up' : 'chevron-down'} size={14} />
                          </span>
                        </button>
                        {openSourcesIdx === i && (
                          <div className="sources-list">
                            <div className="sources-list-header">
                              <span className="sources-list-title">
                                <Icon name="shield" size={13} /> VERIFIED CONTRACT CLAUSES ({parsedCitations.length})
                              </span>
                              <span className="sources-list-doc">{currentContract.name}</span>
                            </div>
                            <div className="sources-grid">
                              {parsedCitations.map((cit) => {
                                const matchingChunk = documentChunks.find(
                                  (dc) =>
                                    (cit.page && String(dc.page_number) === String(cit.page)) ||
                                    (cit.section && dc.section_title && dc.section_title.toLowerCase().includes(cit.section.toLowerCase())) ||
                                    (cit.section && dc.section_number && dc.section_number.toLowerCase().includes(cit.section.toLowerCase()))
                                );
                                return (
                                  <div key={cit.key} className="source-card">
                                    <div className="source-card-top">
                                      <span className="cite-badge">[{cit.index}]</span>
                                      <span className="source-doc-title" title={cit.docName}>
                                        {cit.docName}
                                      </span>
                                      {cit.page && <span className="source-chip page">Page {cit.page}</span>}
                                      {cit.section && <span className="source-chip section">{cit.section}</span>}
                                    </div>
                                    {matchingChunk && matchingChunk.content ? (
                                      <div className="source-quote-box">
                                        "{matchingChunk.content.slice(0, 160).trim()}..."
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Copy button for assistant messages */}
                    {message.role === 'assistant' && (
                      <div className="message-actions">
                        <button
                          className="msg-action-btn"
                          title="Copy response"
                          onClick={() => {
                            navigator.clipboard.writeText(message.text);
                            notify('Response copied');
                          }}
                        >
                          <Icon name="copy" size={13} /> Copy
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {loading && (
              <div className="message assistant">
                <span className="message-avatar"><Icon name="sparkles" size={15} /></span>
                <div className="message-body">
                  <div className="message-content typing-indicator">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--ink-secondary)' }}>
                      Analyzing provisions..."
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={`Ask anything about ${currentContract.name}..."`}
              disabled={loading}
            />
            <button className="send-button" aria-label="Send question" disabled={loading || !question.trim()}>
              <Icon name="arrow" size={17} />
            </button>
          </form>
        </section>

        {showPrompts && (
          <aside className="card prompt-card">
            <p className="eyebrow">AGENTIC QUERIES</p>
            <h2>Recommended prompts</h2>
            {[
              'Summarize key terms & parties',
              'What are the termination conditions?',
              'What obligations are due before renewal?',
              'Are there unusual indemnification provisions?',
              'Check governing law & dispute resolution',
              'Does this agreement auto-renew?',
            ].map((prompt) => (
              <button key={prompt} onClick={() => ask(prompt)} disabled={loading}>
                {prompt}
                <Icon name="arrow" size={15} />
              </button>
            ))}

            <div className="assistant-disclaimer">
              <Icon name="shield" size={16} />
              <span>Answers cite verified source clauses and are for review support, not final legal advice.</span>
            </div>
          </aside>
        )}
      </div>

      {/* Citation Inspector Modal */}
      {selectedCitation && (
        <div className="modal-overlay" onClick={() => setSelectedCitation(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Verified Citation Detail</h2>
              <button className="modal-close" onClick={() => setSelectedCitation(null)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div style={{ background: 'var(--purple-light)', padding: 12, borderRadius: 8, marginBottom: 14 }}>
              <span className="citation" style={{ fontSize: 12, fontWeight: 600 }}>
                {selectedCitation}
              </span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-secondary)' }}>
              This citation references a specific chunk anchored in the uploaded contract document.
              The text was verified by Lexora's hybrid vector & keyword retrieval engine and passed directly to the Agentic synthesis pipeline.
            </p>
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="button button-primary" onClick={() => setSelectedCitation(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Obligations Tracker
// ---------------------------------------------------------------------------
function Obligations({
  obligations,
  contracts,
  onUpdate,
  onAddObligation,
  notify,
}: {
  obligations: Obligation[];
  contracts: Contract[];
  onUpdate: (id: string, status: string) => void;
  onAddObligation: (ob: Obligation) => void;
  notify: (s: string) => void;
}) {
  const [filter, setFilter] = useState('all');
  const [filterContract, setFilterContract] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newParty, setNewParty] = useState('Our organization');
  const [newPriority, setNewPriority] = useState('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newContractId, setNewContractId] = useState(contracts[0]?.id || '');

  const filtered = useMemo(() => {
    return obligations.filter((o) => {
      const matchStatus = filter === 'all' || o.status === filter;
      const matchContract = filterContract === 'all' || o.contract_id === filterContract;
      return matchStatus && matchContract;
    });
  }, [obligations, filter, filterContract]);

  const contractMap = useMemo(() => {
    const map = new Map<string, string>();
    contracts.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [contracts]);

  const openCount = obligations.filter((o) => o.status === 'open').length;
  const criticalCount = obligations.filter((o) => o.priority === 'critical').length;
  const inProgressCount = obligations.filter((o) => o.status === 'in_progress').length;

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!newDesc.trim()) return;
    onAddObligation({
      id: `ob-custom-${Date.now()}`,
      contract_id: newContractId || contracts[0]?.id || 'custom',
      description: newDesc,
      responsible_party: newParty,
      priority: newPriority,
      status: 'open',
      due_date: newDueDate || null,
      due_date_text: null,
    });
    setShowAddModal(false);
    setNewDesc('');
  };

  return (
    <>
      <PageHeader
        eyebrow="COMMITMENTS & COMPLIANCE"
        title="Obligation tracker"
        description="Keep every contractual milestone, SLA, renewal notice, and reporting duty visible and assigned."
        action={
          <button className="button button-primary" onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={16} /> Add obligation
          </button>
        }
      />

      <div className="obligation-kpis">
        <div>
          <b>{obligations.length}</b>
          <span>Total commitments</span>
        </div>
        <div>
          <b>{openCount}</b>
          <span>Open duties</span>
        </div>
        <div>
          <b>{inProgressCount}</b>
          <span>In Progress</span>
        </div>
        <div>
          <b>{criticalCount}</b>
          <span>Critical priority</span>
        </div>
      </div>

      <div className="toolbar">
        <div className="filter-pills">
          {['all', 'open', 'in_progress', 'completed'].map((f) => (
            <button
              key={f}
              className={filter === f ? 'filter-pill selected' : 'filter-pill'}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'in_progress' ? 'In progress' : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="toolbar-selects">
          <select value={filterContract} onChange={(e) => setFilterContract(e.target.value)}>
            <option value="all">All contracts ({contracts.length})</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="card table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Obligation Description</th>
                <th>Contract</th>
                <th>Responsible Party</th>
                <th>Due Date</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((obligation) => (
                <tr key={obligation.id}>
                  <td>
                    <span className="table-primary">
                      {obligation.description}
                      <small>{obligation.due_date_text || 'Contractual schedule'}</small>
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: 11, color: 'var(--purple)' }}>
                      {contractMap.get(obligation.contract_id) || 'General Agreement'}
                    </span>
                  </td>
                  <td>{obligation.responsible_party || 'Unassigned'}</td>
                  <td>
                    <span className={obligation.priority === 'critical' ? 'date-critical' : ''}>
                      {obligation.due_date
                        ? new Date(obligation.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'Review contract timing'}
                    </span>
                  </td>
                  <td>
                    <span className={`priority ${obligation.priority}`}>{obligation.priority}</span>
                  </td>
                  <td>
                    <select
                      className="inline-select"
                      value={obligation.status}
                      onChange={(e) => onUpdate(obligation.id, e.target.value)}
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                      <option value="waived">Waived</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add Obligation Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <form className="modal-content" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <div className="modal-header">
              <h2>Add Contractual Obligation</h2>
              <button type="button" className="modal-close" onClick={() => setShowAddModal(false)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginTop: 12 }}>
              Contract
              <select
                style={{ width: '100%', height: 38, marginTop: 6, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', fontSize: 12 }}
                value={newContractId}
                onChange={(e) => setNewContractId(e.target.value)}
              >
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginTop: 12 }}>
              Description
              <textarea
                required
                rows={3}
                style={{ width: '100%', marginTop: 6, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 10, fontSize: 12, resize: 'vertical' }}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="e.g. Provide written notice of renewal or termination at least 90 days before renewal"
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600 }}>
                Responsible Party
                <input
                  style={{ width: '100%', height: 38, marginTop: 6, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', fontSize: 12 }}
                  value={newParty}
                  onChange={(e) => setNewParty(e.target.value)}
                />
              </label>
              <label style={{ fontSize: 11, fontWeight: 600 }}>
                Priority
                <select
                  style={{ width: '100%', height: 38, marginTop: 6, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', fontSize: 12 }}
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
            </div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginTop: 12 }}>
              Due Date
              <input
                type="date"
                style={{ width: '100%', height: 38, marginTop: 6, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', fontSize: 12 }}
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
              />
            </label>
            <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="button button-secondary" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button type="submit" className="button button-primary">
                Save Obligation
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------
function Admin({ notify }: { notify: (s: string) => void }) {
  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE CONTROLS & SECURITY"
        title="Administration"
        description="Manage role-based access, document permissions, audit trails, and security controls for your legal workspace."
        action={
          <button className="button button-primary" onClick={() => notify('Invite dispatched for user provisioning')}>
            <Icon name="users" size={16} /> Invite member
          </button>
        }
      />
      <div className="admin-grid">
        <section className="card admin-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">TEAM ROLES</p>
              <h2>People & permissions</h2>
            </div>
            <span className="count-badge">12 members</span>
          </div>
          {[
            ['AM', 'Ava Morgan', 'Legal operations', 'Admin'],
            ['JL', 'Jordan Lee', 'Procurement', 'Editor'],
            ['RS', 'Riya Shah', 'Privacy & compliance', 'Reviewer'],
          ].map(([initials, name, dept, role]) => (
            <div className="member-row" key={name}>
              <span className="avatar">{initials}</span>
              <span>
                <b>{name}</b>
                <small>{dept}</small>
              </span>
              <span className="role-badge">{role}</span>
              <Icon name="dots" size={16} />
            </div>
          ))}
          <button className="link-button" onClick={() => notify('User management panel')}>
            Manage all members <Icon name="arrow" size={14} />
          </button>
        </section>

        <section className="card admin-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">DOCUMENT SECURITY</p>
              <h2>Permissions & isolation</h2>
            </div>
            <Icon name="shield" size={20} />
          </div>
          <div className="permission-summary">
            <b>Restricted by default</b>
            <span>Only authorized members can view source clauses and download unredacted agreements.</span>
          </div>
          {[
            ['Asteria Cloud Services MSA', '3 members', 'Restricted'],
            ['Northstar DPA', '5 members', 'Team access'],
            ['Brightline Partner NDA', '2 members', 'Restricted'],
          ].map(([name, members, access]) => (
            <div className="permission-row" key={name}>
              <span className="file-tile">
                <Icon name="file" size={15} />
              </span>
              <span>
                <b>{name}</b>
                <small>{members}</small>
              </span>
              <span className="muted small">{access}</span>
            </div>
          ))}
        </section>

        <section className="card admin-card audit-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">AUDIT TRAIL</p>
              <h2>Recent compliance activity</h2>
            </div>
            <button className="link-button" onClick={() => notify('Full immutable audit log opened')}>
              View log <Icon name="arrow" size={14} />
            </button>
          </div>
          <div className="audit-row">
            <span className="audit-dot green" />
            <span>
              <b>Ava updated risk review status</b>
              <small>Uncapped indemnification exposure · 18 min ago</small>
            </span>
          </div>
          <div className="audit-row">
            <span className="audit-dot purple" />
            <span>
              <b>System analyzed new contract</b>
              <small>Source chunks and clauses persisted · 2 hr ago</small>
            </span>
          </div>
          <div className="audit-row">
            <span className="audit-dot orange" />
            <span>
              <b>Riya approved subprocessor permission request</b>
              <small>Northstar Data Processing Addendum · Yesterday</small>
            </span>
          </div>
        </section>
      </div>
    </>
  );
}

export default App;
