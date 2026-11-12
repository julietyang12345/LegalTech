from app.decision_engine.dependencies import determine_affected_nodes
from app.decision_engine.evaluator import recompute_nodes
from app.extraction.signal_extractor import extract_atomic_signals
from app.ingestion.deduplication import document_already_processed
from app.matching.change_event_matcher import resolve_change_event
from app.matching.document_linker import create_match_review
from app.matching.project_matcher import resolve_project
from app.parsers.base import parse_document
from app.repositories.memory import store
from app.risks.factor_manager import update_risk_factors
from app.risks.ticket_manager import update_risk_tickets
from app.validation.extraction_validator import validate_signals
from app.validation.cross_document_reconciler import reconcile_cross_document_signals
from app.domain_contracts.recording import record_provenance
from app.domain_contracts.schemas import EvidenceAssertion, Provenance
from app.analysis.issue_discovery import discover_issues
from app.analysis.reconciliation import reconcile_issue
from app.analysis.rule_activation import activate_rules
from app.analysis.targeted_retrieval import retrieve_requirement_evidence
from app.legal_knowledge.default_rules import default_rule_set
from app.legal_knowledge.rule_registry import register_rule
from app.services.hashing import stable_text_hash

PIPELINE_VERSION = "0.1.0"


def process_document(document_id: str) -> str:
    if document_already_processed(document_id, PIPELINE_VERSION):
        return "completed"

    document = store.documents[document_id]
    parsed_content = parse_document(document)
    project_match = resolve_project(document, parsed_content)
    change_event_match = resolve_change_event(project_match.project_id, parsed_content)

    needs_review = project_match.status == "needs_review" or change_event_match.status == "needs_review"
    if needs_review:
        create_match_review(
            document_id=document.id,
            payload={
                "project_match": project_match.model_dump(),
                "change_event_match": change_event_match.model_dump(),
            },
        )

    analysis_run_id = f"RUN-{stable_text_hash(document_id + PIPELINE_VERSION)[:12].upper()}"
    extracted_signals = extract_atomic_signals(document, parsed_content)
    for signal in extracted_signals:
        signal.change_event_id = change_event_match.change_event_id

    validated_signals = validate_signals(document, extracted_signals)
    def persist_signal(signal):
        signal.tenant_id = document.tenant_id or "unassigned"
        provenance = record_provenance(
            Provenance(
                tenant_id=document.tenant_id or "unassigned",
                matter_id=document.metadata.get("matter_id") or "unassigned",
                source_document_ids=[document.id],
                analysis_run_id=analysis_run_id,
                pipeline_version=PIPELINE_VERSION,
                method="ai_or_heuristic_extraction",
                rationale="Candidate interpretation linked to source text; not a verified fact.",
            )
        )
        signal.provenance_id = provenance.id
        assertion_id = f"ASSERT-{signal.id}"
        assertion_value = signal.value if isinstance(signal.value, dict) else {
            "value": signal.value,
            "change_event_id": change_event_match.change_event_id,
        }
        store.assertions[assertion_id] = EvidenceAssertion(
            id=assertion_id,
            tenant_id=signal.tenant_id,
            matter_id=document.metadata.get("matter_id") or "unassigned",
            source_document_id=signal.source_document_id,
            assertion_type=signal.signal_type,
            statement=signal.source_text,
            value=assertion_value,
            actor=signal.actor,
            asserted_at=document.received_at,
            provenance=provenance,
        )
        key = f"{signal.source_document_id}:{signal.signal_type}:{signal.source_text_hash}"
        store.signals[key] = signal

    for signal in validated_signals:
        persist_signal(signal)

    reconciled_signals = reconcile_cross_document_signals(
        document,
        parsed_content,
        change_event_match.change_event_id,
    )
    for signal in reconciled_signals:
        persist_signal(signal)
    validated_signals.extend(reconciled_signals)

    matter_id = document.metadata.get("matter_id")
    if matter_id:
        if not store.rule_specs:
            for principle, default_rule in default_rule_set():
                register_rule(principle, default_rule)
        obligations = [
            obligation for obligation in store.obligations.values()
            if obligation.tenant_id == (document.tenant_id or "unassigned")
            and obligation.matter_id == matter_id
        ]
        assertions = [
            assertion for assertion in store.assertions.values()
            if assertion.tenant_id == (document.tenant_id or "unassigned")
            and assertion.matter_id == matter_id
        ]
        rules = [rule for rule in store.rule_specs.values() if rule.approval_status.value == "APPROVED"]
        activations = activate_rules(rules=rules, assertions=assertions)
        for issue in discover_issues(
            tenant_id=document.tenant_id or "unassigned",
            matter_id=matter_id,
            obligations=obligations,
            assertions=assertions,
            rules=rules,
            activations=activations,
        ):
            issue_rule = next((rule for rule in rules if rule.id in issue.rule_ids), None)
            targeted_assertions: list[EvidenceAssertion] = []
            targeted_searches = []
            if issue_rule:
                targeted_assertions, targeted_searches = retrieve_requirement_evidence(
                    issue=issue,
                    rule=issue_rule,
                    assertions=assertions,
                    analysis_run_id=analysis_run_id,
                )
                issue.evidence_ids = sorted(set(issue.evidence_ids + [a.id for a in targeted_assertions]))
            reconcile_issue(
                issue=issue,
                obligations=obligations,
                assertions=assertions + targeted_assertions,
                search_attempts=targeted_searches + [
                    attempt for attempt in store.search_attempts.values()
                    if attempt.tenant_id == issue.tenant_id and attempt.matter_id == issue.matter_id
                ],
                analysis_run_id=analysis_run_id,
                pipeline_version=PIPELINE_VERSION,
                rule=issue_rule,
            )

    affected_nodes = determine_affected_nodes([signal.signal_type for signal in validated_signals])
    node_states = recompute_nodes(change_event_match.change_event_id, affected_nodes)
    if change_event_match.change_event_id:
        factors = update_risk_factors(change_event_match.change_event_id, node_states)
        update_risk_tickets(change_event_match.change_event_id, factors)
    return "waiting_for_review" if needs_review else "completed"
