const matters = [
  { id: 'MATTER-18', name: 'Harbor Terminal Expansion', openRisks: 6, reviews: 3 },
  { id: 'MATTER-22', name: 'North Clinic Buildout', openRisks: 2, reviews: 1 },
];

const timeline = [
  ['Jul 22', 'Owner requested work continue'],
  ['Jul 24', 'Contractor submitted estimate'],
  ['Jul 28', 'Formal notice sent'],
  ['Aug 02', 'Invoice submitted'],
  ['Aug 05', 'Owner disputed amount'],
];

const riskTickets = [
  {
    title: 'Additional work lacks complete contractual support',
    severity: 'High',
    status: 'Open',
    summary:
      'Operational direction is supported, but signed change order and price approval remain incomplete.',
  },
  {
    title: 'Invoice amount support is incomplete',
    severity: 'Medium',
    status: 'Review',
    summary:
      'Invoice evidence exists, but approved amount and pricing method are not fully tied to source documents.',
  },
];

const reviews = [
  { label: 'Document match', detail: 'East slope email has 0.75 confidence for CE-104' },
  { label: 'Contradiction', detail: 'Proceed instruction conflicts with later authorization denial' },
  { label: 'Extraction', detail: 'Potential approved amount needs source confirmation' },
];

function App() {
  return (
    <main className="workspace-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="LegalTech home">LegalTech</a>
        <nav className="nav-list" aria-label="Primary navigation">
          <a className="active" href="#matters">Matters</a>
          <a href="#documents">Documents</a>
          <a href="#reviews">Reviews</a>
          <a href="#risks">Risks</a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Risk operations</p>
            <h1>Change Event Monitor</h1>
          </div>
          <button type="button">Upload Evidence</button>
      </header>

        <div className="metrics-grid">
          <article>
            <span>Documents</span>
            <strong>128</strong>
          </article>
          <article>
            <span>Open Risk Tickets</span>
            <strong>8</strong>
          </article>
          <article>
            <span>Review Queue</span>
            <strong>4</strong>
          </article>
          <article>
            <span>Decision Tree</span>
            <strong>v1.0</strong>
          </article>
        </div>

        <div className="content-grid">
          <section id="matters" className="panel">
            <div className="panel-header">
              <h2>Matters</h2>
              <span>Active</span>
            </div>
            <div className="matter-list">
              {matters.map((matter) => (
                <article className="matter-row" key={matter.id}>
                  <div>
                    <strong>{matter.name}</strong>
                    <span>{matter.id}</span>
                  </div>
                  <div className="matter-counts">
                    <span>{matter.openRisks} risks</span>
                    <span>{matter.reviews} reviews</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section id="documents" className="panel upload-panel">
            <div className="panel-header">
              <h2>Ingestion</h2>
              <span>SHA-256 dedupe</span>
            </div>
            <label>
              <span>Email, invoice, contract, or attachment</span>
              <input type="file" />
            </label>
          </section>

          <section className="panel wide">
            <div className="panel-header">
              <h2>Change Event Timeline</h2>
              <span>CE-104</span>
            </div>
            <ol className="timeline">
              {timeline.map(([date, label]) => (
                <li key={`${date}-${label}`}>
                  <time>{date}</time>
                  <span>{label}</span>
                </li>
              ))}
            </ol>
          </section>

          <section id="risks" className="panel">
            <div className="panel-header">
              <h2>Risk Tickets</h2>
              <span>Persistent</span>
            </div>
            <div className="ticket-list">
              {riskTickets.map((ticket) => (
                <article className="ticket" key={ticket.title}>
                  <div>
                    <strong>{ticket.title}</strong>
                    <span>{ticket.summary}</span>
                  </div>
                  <mark className={ticket.severity.toLowerCase()}>{ticket.severity}</mark>
                </article>
              ))}
            </div>
          </section>

          <section id="reviews" className="panel">
            <div className="panel-header">
              <h2>Review Queue</h2>
              <span>Human feedback</span>
            </div>
            <div className="review-list">
              {reviews.map((review) => (
                <article className="review-row" key={review.detail}>
                  <strong>{review.label}</strong>
                  <span>{review.detail}</span>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

export default App;
