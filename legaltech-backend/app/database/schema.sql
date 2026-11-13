CREATE TABLE organizations (
    id text PRIMARY KEY,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE matters (
    id text PRIMARY KEY,
    organization_id text REFERENCES organizations(id),
    name text NOT NULL,
    tenant_id text NOT NULL DEFAULT 'unassigned',
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
    issue_type text NOT NULL,
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
    tenant_id text NOT NULL DEFAULT 'unassigned',
    matter_id text REFERENCES matters(id),
    UNIQUE (tenant_id, matter_id, file_hash),
    UNIQUE (tenant_id, matter_id, gmail_message_id),
    UNIQUE (tenant_id, matter_id, internet_message_id)
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
    ,tenant_id text NOT NULL DEFAULT 'unassigned'
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
    tenant_id text NOT NULL DEFAULT 'unassigned',
    provenance_id text,
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
    contrary_signal_ids jsonb NOT NULL DEFAULT '[]',
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
    supporting_event_id text REFERENCES events(id),
    supporting_signal_ids jsonb NOT NULL DEFAULT '[]',
    contrary_signal_ids jsonb NOT NULL DEFAULT '[]',
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

-- Domain contracts for the Notice / Change Order vertical slice.
CREATE TABLE analysis_runs (
    id text PRIMARY KEY,
    tenant_id text NOT NULL,
    matter_id text NOT NULL REFERENCES matters(id),
    pipeline_version text NOT NULL,
    status text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE TABLE source_spans (
    id text PRIMARY KEY,
    tenant_id text NOT NULL,
    document_id text NOT NULL REFERENCES documents(id),
    page_number integer,
    section_identifier text,
    start_offset integer,
    end_offset integer,
    text_content text NOT NULL
);

CREATE TABLE provenances (
    id text PRIMARY KEY,
    tenant_id text NOT NULL,
    matter_id text NOT NULL REFERENCES matters(id),
    analysis_run_id text NOT NULL REFERENCES analysis_runs(id),
    source_span_ids jsonb NOT NULL DEFAULT '[]',
    source_document_ids jsonb NOT NULL DEFAULT '[]',
    pipeline_version text NOT NULL,
    model_id text,
    prompt_version text,
    method text NOT NULL,
    review_status text NOT NULL DEFAULT 'PENDING',
    rationale text,
    generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE extra_works (
    id text PRIMARY KEY,
    tenant_id text NOT NULL,
    matter_id text NOT NULL REFERENCES matters(id),
    external_id text NOT NULL,
    title text,
    description text,
    proposed_amount numeric,
    currency text,
    status text NOT NULL DEFAULT 'identified',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, matter_id, external_id)
);

CREATE TABLE obligations (
    id text PRIMARY KEY,
    tenant_id text NOT NULL,
    matter_id text NOT NULL REFERENCES matters(id),
    clause_id text NOT NULL,
    obligation_type text NOT NULL,
    trigger_event text,
    deadline_value integer,
    deadline_unit text,
    required_form text,
    recipient text,
    source_span_id text NOT NULL REFERENCES source_spans(id),
    version text NOT NULL,
    ambiguity_notes text,
    provenance_id text NOT NULL REFERENCES provenances(id)
);

CREATE TABLE evidence_assertions (
    id text PRIMARY KEY,
    tenant_id text NOT NULL,
    matter_id text NOT NULL REFERENCES matters(id),
    source_document_id text NOT NULL REFERENCES documents(id),
    extra_work_id text REFERENCES extra_works(id),
    evidence_role text NOT NULL DEFAULT 'PROJECT_FACT'
        CHECK (evidence_role IN ('PROJECT_FACT', 'NORMATIVE_RULE', 'CONTEXT_ONLY')),
    source_span_id text REFERENCES source_spans(id),
    assertion_type text NOT NULL,
    statement text NOT NULL,
    value jsonb,
    actor text,
    asserted_at timestamptz,
    verified boolean NOT NULL DEFAULT false,
    provenance_id text NOT NULL REFERENCES provenances(id)
);

CREATE TABLE issue_instances (
    id text PRIMARY KEY,
    tenant_id text NOT NULL,
    matter_id text NOT NULL REFERENCES matters(id),
    issue_type text NOT NULL,
    obligation_ids jsonb NOT NULL DEFAULT '[]',
    evidence_ids jsonb NOT NULL DEFAULT '[]',
    rule_version_ids jsonb NOT NULL DEFAULT '[]',
    rule_ids jsonb NOT NULL DEFAULT '[]',
    extra_work_id text REFERENCES extra_works(id),
    workflow_status text NOT NULL,
    evidence_status text NOT NULL,
    current_assessment_id text,
    title text NOT NULL,
    summary text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assessments (
    id text PRIMARY KEY,
    tenant_id text NOT NULL,
    matter_id text NOT NULL REFERENCES matters(id),
    issue_id text NOT NULL REFERENCES issue_instances(id),
    extra_work_id text REFERENCES extra_works(id),
    assessment_status text NOT NULL,
    evidence_status text NOT NULL,
    conclusion text NOT NULL,
    evidence_ids jsonb NOT NULL DEFAULT '[]',
    obligation_ids jsonb NOT NULL DEFAULT '[]',
    rule_version_ids jsonb NOT NULL DEFAULT '[]',
    rule_ids jsonb NOT NULL DEFAULT '[]',
    provenance_id text NOT NULL REFERENCES provenances(id),
    supersedes_assessment_id text REFERENCES assessments(id),
    is_current boolean NOT NULL DEFAULT true,
    stale_reason text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE search_attempts (
    id text PRIMARY KEY,
    tenant_id text NOT NULL,
    matter_id text NOT NULL REFERENCES matters(id),
    issue_id text REFERENCES issue_instances(id),
    query text NOT NULL,
    scope jsonb NOT NULL DEFAULT '{}',
    filters jsonb NOT NULL DEFAULT '{}',
    corpus_version text NOT NULL,
    retrieval_strategy text NOT NULL,
    result_document_ids jsonb NOT NULL DEFAULT '[]',
    result_count integer NOT NULL DEFAULT 0,
    analysis_run_id text NOT NULL REFERENCES analysis_runs(id),
    completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE legal_principles (
    id text PRIMARY KEY,
    tenant_id text NOT NULL,
    matter_id text NOT NULL REFERENCES matters(id),
    title text NOT NULL,
    statement text NOT NULL,
    jurisdiction text NOT NULL,
    source_document_ids jsonb NOT NULL DEFAULT '[]',
    source_span_ids jsonb NOT NULL DEFAULT '[]',
    version text NOT NULL,
    approval_status text NOT NULL,
    provenance_id text NOT NULL REFERENCES provenances(id),
    UNIQUE (id, version)
);

CREATE TABLE executable_rules (
    id text NOT NULL,
    version text NOT NULL,
    tenant_id text NOT NULL,
    matter_id text NOT NULL REFERENCES matters(id),
    title text NOT NULL,
    issue_type text NOT NULL,
    legal_principle_id text NOT NULL REFERENCES legal_principles(id),
    approval_status text NOT NULL,
    applicability jsonb NOT NULL,
    discovery_triggers jsonb NOT NULL DEFAULT '[]',
    assessment_preconditions jsonb NOT NULL DEFAULT '[]',
    exceptions_to_check jsonb NOT NULL DEFAULT '[]',
    review_policy text NOT NULL,
    provenance_id text NOT NULL REFERENCES provenances(id),
    PRIMARY KEY (id, version)
);

CREATE TABLE rule_requirements (
    id text NOT NULL,
    rule_id text NOT NULL,
    rule_version text NOT NULL,
    label text NOT NULL,
    evaluation text NOT NULL,
    evidence_queries jsonb NOT NULL DEFAULT '[]',
    supporting_assertion_types jsonb NOT NULL DEFAULT '[]',
    contrary_assertion_types jsonb NOT NULL DEFAULT '[]',
    deterministic_fields jsonb NOT NULL DEFAULT '[]',
    lawyer_review_required boolean NOT NULL DEFAULT false,
    PRIMARY KEY (id, rule_id, rule_version),
    FOREIGN KEY (rule_id, rule_version) REFERENCES executable_rules(id, version)
);

CREATE TABLE rule_activations (
    id text PRIMARY KEY,
    tenant_id text NOT NULL,
    matter_id text NOT NULL REFERENCES matters(id),
    rule_id text NOT NULL,
    rule_version text NOT NULL,
    status text NOT NULL,
    trigger_ids jsonb NOT NULL DEFAULT '[]',
    applicability_reason text NOT NULL,
    requires_lawyer_review boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (rule_id, rule_version) REFERENCES executable_rules(id, version)
);

CREATE TABLE requirement_checks (
    id text PRIMARY KEY,
    tenant_id text NOT NULL,
    matter_id text NOT NULL REFERENCES matters(id),
    assessment_id text,
    extra_work_id text REFERENCES extra_works(id),
    requirement_id text NOT NULL,
    result text NOT NULL,
    evidence_status text NOT NULL,
    supporting_evidence_ids jsonb NOT NULL DEFAULT '[]',
    contrary_evidence_ids jsonb NOT NULL DEFAULT '[]',
    search_attempt_ids jsonb NOT NULL DEFAULT '[]',
    explanation text NOT NULL,
    requires_lawyer_review boolean NOT NULL DEFAULT false,
    provenance_id text NOT NULL REFERENCES provenances(id)
);

CREATE TABLE evidence_links (
    id text PRIMARY KEY,
    tenant_id text NOT NULL,
    matter_id text NOT NULL REFERENCES matters(id),
    extra_work_id text REFERENCES extra_works(id),
    requirement_check_id text NOT NULL REFERENCES requirement_checks(id),
    assertion_id text NOT NULL REFERENCES evidence_assertions(id),
    relation_type text NOT NULL
        CHECK (relation_type IN ('SUPPORTS', 'CONTRADICTS', 'CONTEXT_ONLY')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (requirement_check_id, assertion_id, relation_type)
);

CREATE TABLE dependency_edges (
    id text PRIMARY KEY,
    tenant_id text NOT NULL,
    matter_id text NOT NULL REFERENCES matters(id),
    upstream_type text NOT NULL,
    upstream_id text NOT NULL,
    downstream_type text NOT NULL,
    downstream_id text NOT NULL,
    relation_type text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE case_rule_candidates (
    id text PRIMARY KEY,
    tenant_id text NOT NULL,
    matter_id text NOT NULL REFERENCES matters(id),
    case_document_id text NOT NULL REFERENCES documents(id),
    title text NOT NULL,
    extracted_facts jsonb NOT NULL DEFAULT '[]',
    court_findings jsonb NOT NULL DEFAULT '[]',
    candidate_principle text NOT NULL,
    applicability_limits jsonb NOT NULL DEFAULT '[]',
    source_span_ids jsonb NOT NULL DEFAULT '[]',
    review_status text NOT NULL DEFAULT 'PENDING',
    requires_lawyer_review boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Defense in depth: application code must set app.tenant_id per transaction.
-- Rows without a tenant are intentionally not visible through tenant-scoped DB roles.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['matters','documents','events','extracted_signals','analysis_runs','source_spans','provenances','obligations','evidence_assertions','issue_instances','assessments','search_attempts','legal_principles','executable_rules','rule_activations','requirement_checks','dependency_edges','case_rule_candidates']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))', table_name, table_name);
  END LOOP;
END $$;

CREATE INDEX idx_events_matter_time ON events (matter_id, occurred_at);
CREATE INDEX idx_signals_change_event_type ON extracted_signals (change_event_id, signal_type);
CREATE INDEX idx_jobs_status_next_attempt ON processing_jobs (status, next_attempt_at);
CREATE INDEX idx_reviews_status ON human_reviews (status);
