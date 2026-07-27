import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Flag,
  Gavel,
  Loader2,
  Play,
  RefreshCw,
  Upload,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

type Matter = {
  id: string;
  name: string;
};

type Project = {
  id: string;
  matter_id: string;
  name: string;
  project_number?: string;
  site_address?: string;
};

type ChangeEvent = {
  id: string;
  project_id: string;
  title: string;
  status: string;
};

type DocumentRecord = {
  id: string;
  document_type: string;
  sender?: string;
  subject?: string;
  storage_path: string;
  metadata: { original_filename?: string };
};

type Job = {
  id: string;
  document_id: string;
  status: string;
  attempt_count: number;
  error_message?: string;
};

type Signal = {
  id: string;
  signal_type: string;
  value: unknown;
  confidence: number;
  source_document_id: string;
  source_text: string;
};

type NodeState = {
  id: string;
  node_id: string;
  status: string;
  missing_factors: string[];
  supporting_signal_ids: string[];
  contrary_signal_ids: string[];
};

type RiskFactor = {
  id: string;
  factor_type: string;
  status: string;
  strength: string;
  supporting_signal_ids: string[];
  contrary_signal_ids: string[];
  first_detected_at: string;
  last_updated_at: string;
};

type RiskTicket = {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  status: string;
  summary: string;
  factor_ids: string[];
};

type RiskTicketHistory = {
  id: string;
  risk_ticket_id: string;
  previous_severity?: string | null;
  new_severity?: string | null;
  previous_status?: string | null;
  new_status?: string | null;
  reason: string;
  supporting_event_id?: string | null;
  supporting_signal_ids: string[];
  contrary_signal_ids: string[];
  created_at: string;
};

type Review = {
  id: string;
  review_type: string;
  status: string;
  document_id?: string;
  payload: {
    project_match?: MatchResult;
    change_event_match?: MatchResult;
  };
};

type MatchResult = {
  project_id?: string | null;
  change_event_id?: string | null;
  confidence: number;
  reasons: string[];
  status: string;
};

type ChangeEventDetail = {
  change_event: ChangeEvent | null;
  signals: Signal[];
  node_states: NodeState[];
  risk_factors: RiskFactor[];
  risk_tickets: RiskTicket[];
  risk_ticket_history: RiskTicketHistory[];
};

const sampleEvidence = {
  risk: 'PRJ-100 Change Event 1: Please proceed while pricing support is assembled.',
  mitigate: 'PRJ-100 Change Event 1: The signed change document is attached for the requested change.',
  approved: 'PRJ-100 Change Event 1: The designated reviewer is authorized to approve this change for $42,000.',
  limited: 'PRJ-100 Change Event 1: Authorization was limited to scheduling only, not additional cost.',
  invoice: 'PRJ-100 Change Event 1 invoice amount due $48,500. Approved, see attached.',
};

const defaultDetail: ChangeEventDetail = {
  change_event: null,
  signals: [],
  node_states: [],
  risk_factors: [],
  risk_tickets: [],
  risk_ticket_history: [],
};

function App() {
  const [matter, setMatter] = useState<Matter | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [changeEvent, setChangeEvent] = useState<ChangeEvent | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [detail, setDetail] = useState<ChangeEventDetail>(defaultDetail);
  const [evidenceText, setEvidenceText] = useState(sampleEvidence.risk);
  const [documentType, setDocumentType] = useState('email');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('Create a workspace, upload evidence, then process pending jobs.');
  const [error, setError] = useState('');

  const pendingJobs = jobs.filter((job) => job.status === 'pending').length;
  const openReviews = reviews.filter((review) => review.status === 'open').length;
  const activeRisks = detail.risk_factors.filter((factor) => !['Mitigated', 'Resolved'].includes(factor.status)).length;
  const highRisk = detail.risk_tickets.some((ticket) => ticket.severity === 'high' && ticket.status !== 'Resolved');

  const currentMatch = useMemo(() => {
    const review = reviews.find((item) => item.status === 'open' && item.payload.change_event_match);
    return review?.payload.change_event_match;
  }, [reviews]);

  useEffect(() => {
    void refresh();
  }, []);

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, init);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  async function refresh(nextChangeEventId = changeEvent?.id) {
    setError('');
    const [documentList, jobList, reviewList] = await Promise.all([
      api<DocumentRecord[]>('/api/documents'),
      api<Job[]>('/api/jobs'),
      api<Review[]>('/api/reviews?status='),
    ]);
    setDocuments(documentList);
    setJobs(jobList);
    setReviews(reviewList);
    if (nextChangeEventId) {
      setDetail(await api<ChangeEventDetail>(`/api/change-events/${nextChangeEventId}`));
    }
  }

  async function runAction(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError('');
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unexpected workflow error');
    } finally {
      setBusy('');
    }
  }

  async function createWorkspace() {
    await runAction('Creating workspace', async () => {
      const createdMatter = await api<Matter>('/api/matters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Demo Matter' }),
      });
      const createdProject = await api<Project>(`/api/matters/${createdMatter.id}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Demo Project',
          project_number: 'PRJ-100',
          site_address: 'Project Site',
        }),
      });
      const createdChangeEvent = await api<ChangeEvent>('/api/change-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: createdProject.id,
          title: 'Change Event 1',
        }),
      });
      setMatter(createdMatter);
      setProject(createdProject);
      setChangeEvent(createdChangeEvent);
      setMessage('Workspace created. Upload evidence mentioning PRJ-100 and Change Event 1.');
      await refresh(createdChangeEvent.id);
    });
  }

  async function uploadEvidence() {
    if (!matter) {
      setError('Create the matter/project/change event first.');
      return;
    }
    await runAction('Uploading evidence', async () => {
      const form = new FormData();
      form.append('file', new Blob([evidenceText], { type: 'text/plain' }), `${documentType}-${Date.now()}.txt`);
      form.append('matter_id', matter.id);
      form.append('document_type', documentType);
      form.append('sender', 'pm@owner.com');
      form.append('subject', 'Field direction and pricing support');
      await api('/api/documents/upload', { method: 'POST', body: form });
      setMessage('Evidence uploaded and a processing job was queued.');
      await refresh();
    });
  }

  async function processJobs() {
    await runAction('Processing jobs', async () => {
      const result = await api<{ processed_count: number; jobs: Job[] }>('/api/jobs/process-all', {
        method: 'POST',
      });
      setJobs(result.jobs);
      setMessage(`${result.processed_count} job(s) processed. Review the extracted signals and risk flags.`);
      await refresh();
    });
  }

  async function resolveFirstReview() {
    const review = reviews.find((item) => item.status === 'open');
    if (!review || !project || !changeEvent) {
      return;
    }
    await runAction('Resolving review', async () => {
      await api(`/api/reviews/${review.id}/resolve-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'demo-user',
          selected_project_id: project.id,
          selected_change_event_id: changeEvent.id,
          features: {
            sender: 'pm@owner.com',
            keyword: 'change event 1',
            aliases: ['requested change'],
          },
        }),
      });
      setMessage('Review resolved. Future similar evidence receives a feedback boost.');
      await refresh();
    });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Risk console home">
          <Gavel size={22} />
          Risk Console
        </a>
        <nav className="nav-list" aria-label="Workflow navigation">
          <a className="active" href="#workflow">Workflow</a>
          <a href="#evidence">Evidence</a>
          <a href="#risks">Risks</a>
          <a href="#source">Sources</a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Backend connected workflow</p>
            <h1>Evidence Risk Console</h1>
          </div>
          <button className="ghost-button" type="button" onClick={() => void runAction('Refreshing', () => refresh())}>
            <RefreshCw size={17} />
            Refresh
          </button>
        </header>

        <section className={highRisk ? 'status-banner alert' : 'status-banner'}>
          <div>
            <strong>{highRisk ? 'High risk flagged' : 'Workflow ready'}</strong>
            <span>{error || message}</span>
          </div>
          {busy && (
            <span className="busy">
              <Loader2 size={16} />
              {busy}
            </span>
          )}
        </section>

        <section className="metrics-grid" aria-label="Workflow metrics">
          <Metric label="Documents" value={documents.length} />
          <Metric label="Pending Jobs" value={pendingJobs} />
          <Metric label="Open Reviews" value={openReviews} />
          <Metric label="Active Risks" value={activeRisks} intent={activeRisks ? 'risk' : 'ok'} />
        </section>

        <section id="workflow" className="workflow-grid">
          <Panel title="Step Runner" meta="Create, upload, process">
            <div className="step-list">
              <WorkflowStep
                icon={<ClipboardCheck size={18} />}
                title="1. Create matter, project, and change event"
                detail={changeEvent ? `${matter?.name} / ${project?.project_number} / ${changeEvent.title}` : 'Seeds the workspace used for matching.'}
                complete={Boolean(changeEvent)}
              />
              <WorkflowStep
                icon={<Upload size={18} />}
                title="2. Upload evidence"
                detail={documents.length ? `${documents.length} document(s) stored with SHA-256 dedupe.` : 'Uploads text as a document and queues processing.'}
                complete={documents.length > 0}
              />
              <WorkflowStep
                icon={<FileSearch size={18} />}
                title="3. Process job and extract signals"
                detail={detail.signals.length ? `${detail.signals.length} signal(s) extracted and sourced.` : 'Runs the worker pipeline inside the API process.'}
                complete={detail.signals.length > 0}
              />
              <WorkflowStep
                icon={<Flag size={18} />}
                title="4. Match event, flag risk, or create review"
                detail={detail.risk_tickets.length ? `${detail.risk_tickets.length} risk ticket(s) generated.` : 'Weak matches create human review tasks.'}
                complete={detail.risk_tickets.length > 0 || reviews.length > 0}
              />
            </div>
            <div className="button-row">
              <button type="button" onClick={() => void createWorkspace()} disabled={Boolean(busy)}>
                <CheckCircle2 size={17} />
                Create Workspace
              </button>
              <button type="button" onClick={() => void uploadEvidence()} disabled={Boolean(busy || !matter)}>
                <Upload size={17} />
                Upload Evidence
              </button>
              <button type="button" onClick={() => void processJobs()} disabled={Boolean(busy)}>
                <Play size={17} />
                Process Jobs
              </button>
            </div>
          </Panel>

          <Panel title="Evidence Composer" meta="Try evidence scenarios">
            <div className="segmented">
              <button type="button" onClick={() => setEvidenceText(sampleEvidence.risk)}>Missing change order</button>
              <button type="button" onClick={() => setEvidenceText(sampleEvidence.mitigate)}>Mitigation</button>
              <button type="button" onClick={() => setEvidenceText(sampleEvidence.approved)}>Authority</button>
              <button type="button" onClick={() => setEvidenceText(sampleEvidence.limited)}>Limit</button>
              <button type="button" onClick={() => setEvidenceText(sampleEvidence.invoice)}>Invoice</button>
            </div>
            <label className="field">
              <span>Document type</span>
              <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
                <option value="email">Email</option>
                <option value="change_order">Change order</option>
                <option value="invoice">Invoice</option>
                <option value="daily_report">Daily report</option>
              </select>
            </label>
            <label className="field">
              <span>Evidence text</span>
              <textarea value={evidenceText} onChange={(event) => setEvidenceText(event.target.value)} />
            </label>
          </Panel>
        </section>

        <section className="content-grid">
          <Panel id="risks" title="Risk Tickets" meta="Persistent flags">
            {detail.risk_tickets.length === 0 ? (
              <EmptyState text="No risk ticket yet. Upload and process evidence with incomplete authorization support." />
            ) : (
              <div className="ticket-list">
                {detail.risk_tickets.map((ticket) => (
                  <article className="ticket" key={ticket.id}>
                    <div>
                      <strong>{ticket.title}</strong>
                      <span>{ticket.summary}</span>
                    </div>
                    <mark className={ticket.severity}>{ticket.severity}</mark>
                    <small>{ticket.status}</small>
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Risk Factor Ledger" meta="Matter memory">
            {detail.risk_factors.length === 0 ? (
              <EmptyState text="Risk factors appear after decision gates detect or update a condition." />
            ) : (
              <div className="ledger-list">
                {detail.risk_factors.map((factor) => (
                  <article className="ledger-row" key={factor.id}>
                    <div>
                      <strong>{labelize(factor.factor_type)}</strong>
                      <span>
                        {factor.supporting_signal_ids.length} supporting / {factor.contrary_signal_ids.length} contrary signal(s)
                      </span>
                    </div>
                    <mark className={riskStatusClass(factor.status)}>{factor.status}</mark>
                    <small>{factor.strength}</small>
                    <small>{formatDate(factor.first_detected_at)} to {formatDate(factor.last_updated_at)}</small>
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Decision Gates" meta="Rule evaluation">
            {detail.node_states.length === 0 ? (
              <EmptyState text="Decision nodes appear after extracted signals are linked to the change event." />
            ) : (
              <div className="gate-list">
                {detail.node_states.map((node) => (
                  <article className="gate" key={node.id}>
                    <strong>{labelize(node.node_id)}</strong>
                    <mark className={node.status === 'supported' ? 'low' : node.status === 'disputed' ? 'high' : 'medium'}>
                      {node.status}
                    </mark>
                    {(node.supporting_signal_ids.length > 0 || node.contrary_signal_ids.length > 0) && (
                      <span>{node.supporting_signal_ids.length} supporting / {node.contrary_signal_ids.length} contrary signal(s)</span>
                    )}
                    {node.missing_factors.length > 0 && <span>Missing: {node.missing_factors.join(', ')}</span>}
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <Panel id="source" title="Evidence Sourcing" meta="Atomic evidence">
            {detail.signals.length === 0 ? (
              <EmptyState text="Signal source excerpts will appear here after processing." />
            ) : (
              <div className="source-list">
                {detail.signals.map((signal) => (
                  <article className="source-card" key={signal.id}>
                    <div>
                      <strong>{labelize(signal.signal_type)}</strong>
                      <span>{Math.round(signal.confidence * 100)}% confidence from {signal.source_document_id}</span>
                    </div>
                    <blockquote>{signal.source_text}</blockquote>
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Human Review" meta="Weak confidence">
            {reviews.length === 0 ? (
              <EmptyState text="Weak project or change-event matches create review tasks." />
            ) : (
              <div className="review-list">
                {reviews.map((review) => (
                  <article className="review-row" key={review.id}>
                    <div>
                      <strong>{review.review_type}</strong>
                      <span>
                        {review.status} / event confidence {Math.round((review.payload.change_event_match?.confidence || 0) * 100)}%
                      </span>
                    </div>
                    <mark className={review.status === 'open' ? 'medium' : 'low'}>{review.status}</mark>
                  </article>
                ))}
              </div>
            )}
            {currentMatch && (
              <p className="hint">Match reasons: {currentMatch.reasons.length ? currentMatch.reasons.join(', ') : 'no confident reason'}</p>
            )}
            <button type="button" onClick={() => void resolveFirstReview()} disabled={Boolean(busy || !openReviews)}>
              <ClipboardCheck size={17} />
              Resolve First Review
            </button>
          </Panel>

          <Panel title="Ticket History" meta="Risk evolution">
            {detail.risk_ticket_history.length === 0 ? (
              <EmptyState text="Ticket changes appear when later evidence changes severity or lifecycle status." />
            ) : (
              <div className="history-list">
                {detail.risk_ticket_history.map((item) => (
                  <article className="history-row" key={item.id}>
                    <strong>{item.previous_status || 'New'} to {item.new_status || 'Updated'}</strong>
                    <span>{item.previous_severity || '-'} to {item.new_severity || '-'}</span>
                    <small>{item.reason}</small>
                    <small>{formatDate(item.created_at)}</small>
                  </article>
                ))}
              </div>
            )}
          </Panel>
        </section>
      </section>
    </main>
  );
}

function Panel({
  children,
  id,
  title,
  meta,
}: {
  children: React.ReactNode;
  id?: string;
  title: string;
  meta: string;
}) {
  return (
    <section id={id} className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        <span>{meta}</span>
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, intent }: { label: string; value: number; intent?: 'ok' | 'risk' }) {
  return (
    <article className={intent === 'risk' ? 'metric risk' : 'metric'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function WorkflowStep({
  complete,
  detail,
  icon,
  title,
}: {
  complete: boolean;
  detail: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <article className={complete ? 'workflow-step complete' : 'workflow-step'}>
      <div className="step-icon">{complete ? <CheckCircle2 size={18} /> : icon}</div>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <AlertTriangle size={18} />
      <span>{text}</span>
    </div>
  );
}

function labelize(value: string) {
  return value.replaceAll('_', ' ');
}

function riskStatusClass(status: string) {
  if (['Contradicted', 'Escalated'].includes(status)) {
    return 'high';
  }
  if (['Mitigated', 'Resolved', 'Supported'].includes(status)) {
    return 'low';
  }
  return 'medium';
}

function formatDate(value?: string) {
  if (!value) {
    return '-';
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

export default App;
