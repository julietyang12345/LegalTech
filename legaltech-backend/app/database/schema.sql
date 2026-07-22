CREATE TABLE organizations (
    id text PRIMARY KEY,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE matters (
    id text PRIMARY KEY,
    organization_id text REFERENCES organizations(id),
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
    id text PRIMARY KEY,
    matter_id text NOT NULL REFERENCES matters(id),
    name text NOT NULL,
    project_number text,
    site_address text
);

CREATE TABLE contracts (
    id text PRIMARY KEY,
    project_id text NOT NULL REFERENCES projects(id),
    contract_number text,
    title text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE change_events (
    id text PRIMARY KEY,
    project_id text NOT NULL REFERENCES projects(id),
    title text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    first_detected_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documents (
    id text PRIMARY KEY,
    document_type text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    sender text,
    subject text,
    file_hash text NOT NULL,
    storage_path text NOT NULL,
    gmail_message_id text,
    internet_message_id text,
    metadata jsonb NOT NULL DEFAULT '{}',
    UNIQUE (file_hash),
    UNIQUE (gmail_message_id),
    UNIQUE (internet_message_id)
);

CREATE TABLE document_attachments (
    id text PRIMARY KEY,
    parent_document_id text NOT NULL REFERENCES documents(id),
    document_id text NOT NULL REFERENCES documents(id),
    attachment_hash text NOT NULL
);

CREATE TABLE document_links (
    id text PRIMARY KEY,
    document_id text NOT NULL REFERENCES documents(id),
    matter_id text REFERENCES matters(id),
    project_id text REFERENCES projects(id),
    change_event_id text REFERENCES change_events(id),
    match_confidence numeric(4,3) NOT NULL DEFAULT 0,
    status text NOT NULL,
    match_reasons jsonb NOT NULL DEFAULT '[]',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
    id text PRIMARY KEY,
    event_type text NOT NULL,
    matter_id text REFERENCES matters(id),
    document_id text NOT NULL REFERENCES documents(id),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE extracted_signals (
    id text PRIMARY KEY,
    change_event_id text REFERENCES change_events(id),
    signal_type text NOT NULL,
    value jsonb NOT NULL,
    actor text,
    source_document_id text NOT NULL REFERENCES documents(id),
    source_text text NOT NULL,
    source_text_hash text NOT NULL,
    confidence numeric(4,3) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_document_id, signal_type, source_text_hash)
);

CREATE TABLE signal_relations (
    id text PRIMARY KEY,
    source_signal_id text NOT NULL REFERENCES extracted_signals(id),
    target_signal_id text NOT NULL REFERENCES extracted_signals(id),
    relation_type text NOT NULL
);

CREATE TABLE decision_tree_versions (
    id text PRIMARY KEY,
    version text NOT NULL UNIQUE,
    rules jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE decision_nodes (
    id text PRIMARY KEY,
    tree_version_id text NOT NULL REFERENCES decision_tree_versions(id),
    node_id text NOT NULL,
    label text NOT NULL,
    UNIQUE (tree_version_id, node_id)
);

CREATE TABLE node_dependencies (
    id text PRIMARY KEY,
    decision_node_id text NOT NULL REFERENCES decision_nodes(id),
    signal_type text NOT NULL
);

CREATE TABLE node_states (
    id text PRIMARY KEY,
    change_event_id text NOT NULL REFERENCES change_events(id),
    tree_version text NOT NULL,
    node_id text NOT NULL,
    status text NOT NULL,
    supporting_signal_ids jsonb NOT NULL DEFAULT '[]',
    contrary_signal_ids jsonb NOT NULL DEFAULT '[]',
    missing_factors jsonb NOT NULL DEFAULT '[]',
    evaluated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (change_event_id, tree_version, node_id)
);

CREATE TABLE risk_factors (
    id text PRIMARY KEY,
    change_event_id text NOT NULL REFERENCES change_events(id),
    factor_type text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    strength text NOT NULL,
    first_detected_at timestamptz NOT NULL DEFAULT now(),
    last_updated_at timestamptz NOT NULL DEFAULT now(),
    supporting_signal_ids jsonb NOT NULL DEFAULT '[]',
    mitigated_by_document_id text REFERENCES documents(id),
    mitigated_at timestamptz,
    UNIQUE (change_event_id, factor_type)
);

CREATE TABLE risk_tickets (
    id text PRIMARY KEY,
    change_event_id text NOT NULL REFERENCES change_events(id),
    severity text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    title text NOT NULL,
    summary text NOT NULL,
    factor_ids jsonb NOT NULL DEFAULT '[]',
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE risk_ticket_history (
    id text PRIMARY KEY,
    risk_ticket_id text NOT NULL REFERENCES risk_tickets(id),
    previous_severity text,
    new_severity text,
    previous_status text,
    new_status text,
    reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE processing_jobs (
    id text PRIMARY KEY,
    document_id text NOT NULL REFERENCES documents(id),
    job_type text NOT NULL,
    status text NOT NULL,
    attempt_count integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    locked_at timestamptz,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    pipeline_version text NOT NULL,
    UNIQUE (document_id, job_type, pipeline_version)
);

CREATE TABLE human_reviews (
    id text PRIMARY KEY,
    review_type text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    document_id text REFERENCES documents(id),
    matter_id text REFERENCES matters(id),
    project_id text REFERENCES projects(id),
    change_event_id text REFERENCES change_events(id),
    payload jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz
);

CREATE TABLE match_feedback (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    document_id text NOT NULL REFERENCES documents(id),
    selected_project_id text REFERENCES projects(id),
    selected_change_event_id text REFERENCES change_events(id),
    features jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
    id text PRIMARY KEY,
    matter_id text REFERENCES matters(id),
    risk_ticket_id text REFERENCES risk_tickets(id),
    notification_type text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    idempotency_key text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz
);

CREATE TABLE audit_logs (
    id text PRIMARY KEY,
    actor_id text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_matter_time ON events (matter_id, occurred_at);
CREATE INDEX idx_signals_change_event_type ON extracted_signals (change_event_id, signal_type);
CREATE INDEX idx_jobs_status_next_attempt ON processing_jobs (status, next_attempt_at);
CREATE INDEX idx_reviews_status ON human_reviews (status);
