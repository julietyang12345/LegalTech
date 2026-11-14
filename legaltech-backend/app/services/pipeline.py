import logging
import os
from contextlib import contextmanager
from time import perf_counter

from app.analysis.dependency_graph import determine_assertion_affected_issues
from app.analysis.evidence_issue_matching import match_new_evidence
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
from app.domain_contracts.schemas import EvidenceAssertion, ExtraWork, Provenance
from app.analysis.evidence_relationships import assertion_scope, evidence_role_for_document, infer_extra_work_id
from app.analysis.issue_discovery import discover_issues
from app.analysis.reconciliation import reconcile_issue
from app.analysis.rule_activation import activate_rules
from app.analysis.targeted_retrieval import retrieve_requirement_evidence
from app.legal_knowledge.default_rules import default_rule_set
from app.legal_knowledge.rule_registry import register_rule
from app.services.hashing import stable_text_hash

PIPELINE_VERSION = "0.1.0"
logger = logging.getLogger(__name__)


@contextmanager
def _detector_step(name: str, **context):
    started = perf_counter()
    details = " ".join(f"{key}={value}" for key, value in context.items() if value is not None)
    logger.info("[detector] step started name=%s %s", name, details)
    try:
        yield
    except Exception:
        logger.exception("[detector] step failed name=%s %s duration_ms=%d", name, details, (perf_counter() - started) * 1000)
        raise
    else:
        logger.info("[detector] step finished name=%s %s duration_ms=%d", name, details, (perf_counter() - started) * 1000)


def process_document(document_id: str) -> str:
    logger.info("[detector] document pipeline started document_id=%s", document_id)
    if document_already_processed(document_id, PIPELINE_VERSION):
        logger.info("[detector] document skipped document_id=%s reason=already_processed pipeline=%s", document_id, PIPELINE_VERSION)
        return "completed"

    document = store.documents[document_id]
    try:
        stored_bytes = os.path.getsize(document.storage_path)
    except OSError:
        stored_bytes = "unknown"
    logger.info("[detector] document loaded document_id=%s type=%s matter_id=%s stored_bytes=%s filename=%s", document_id, document.document_type, document.metadata.get("matter_id"), stored_bytes, document.metadata.get("original_filename"))
    with _detector_step("parse_document", document_id=document_id):
        parsed_content = parse_document(document)
    logger.info("[detector] document parsed document_id=%s text_chars=%d", document_id, len(parsed_content.text or ""))
    with _detector_step("resolve_project", document_id=document_id):
        project_match = resolve_project(document, parsed_content)
    logger.info("[detector] project resolved document_id=%s project_id=%s status=%s", document_id, project_match.project_id, project_match.status)
    with _detector_step("resolve_change_event", document_id=document_id):
        change_event_match = resolve_change_event(project_match.project_id, parsed_content)
    logger.info("[detector] change event resolved document_id=%s change_event_id=%s status=%s", document_id, change_event_match.change_event_id, change_event_match.status)

    needs_review = project_match.status == "needs_review" or change_event_match.status == "needs_review"
    if needs_review:
        logger.info("[detector] match review required document_id=%s project_status=%s event_status=%s", document_id, project_match.status, change_event_match.status)
        create_match_review(
            document_id=document.id,
            payload={
                "project_match": project_match.model_dump(),
                "change_event_match": change_event_match.model_dump(),
            },
        )

    analysis_run_id = f"RUN-{stable_text_hash(document_id + PIPELINE_VERSION)[:12].upper()}"
    new_assertion_ids: set[str] = set()
    new_extra_work_ids: set[str] = set()
    with _detector_step("extract_atomic_signals", document_id=document_id):
        extracted_signals = extract_atomic_signals(document, parsed_content)
    logger.info("[detector] signals extracted document_id=%s count=%d", document_id, len(extracted_signals))
    for signal in extracted_signals:
        signal.change_event_id = change_event_match.change_event_id

    with _detector_step("validate_signals", document_id=document_id, input_count=len(extracted_signals)):
        validated_signals = validate_signals(document, extracted_signals)
    logger.info("[detector] signals validated document_id=%s count=%d", document_id, len(validated_signals))
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
        extra_work_id = infer_extra_work_id(signal.value, signal.source_text)
        if extra_work_id and not any(item.external_id == extra_work_id for item in store.extra_works.values()):
            extra_work = ExtraWork(
                id=extra_work_id,
                tenant_id=signal.tenant_id,
                matter_id=document.metadata.get("matter_id") or "unassigned",
                external_id=extra_work_id,
                title=signal.source_text[:160],
            )
            store.extra_works[extra_work.id] = extra_work
        if extra_work_id:
            new_extra_work_ids.add(extra_work_id)
        assertion_value = dict(signal.value) if isinstance(signal.value, dict) else {
            "value": signal.value,
            "change_event_id": change_event_match.change_event_id,
        }
        assertion_value.setdefault("change_event_id", change_event_match.change_event_id)
        if extra_work_id:
            assertion_value["extra_work_id"] = extra_work_id
        store.assertions[assertion_id] = EvidenceAssertion(
            id=assertion_id,
            tenant_id=signal.tenant_id,
            matter_id=document.metadata.get("matter_id") or "unassigned",
            source_document_id=signal.source_document_id,
            extra_work_id=extra_work_id,
            evidence_role=evidence_role_for_document(document),
            assertion_type=signal.signal_type,
            statement=signal.source_text,
            value=assertion_value,
            actor=signal.actor,
            asserted_at=document.received_at,
            provenance=provenance,
        )
        new_assertion_ids.add(assertion_id)
        key = f"{signal.source_document_id}:{signal.signal_type}:{signal.source_text_hash}"
        store.signals[key] = signal

    with _detector_step("persist_signals", document_id=document_id, count=len(validated_signals)):
        for signal in validated_signals:
            persist_signal(signal)

    with _detector_step("reconcile_cross_document_signals", document_id=document_id):
        reconciled_signals = reconcile_cross_document_signals(
            document,
            parsed_content,
            change_event_match.change_event_id,
        )
    logger.info("[detector] cross-document signals produced document_id=%s count=%d", document_id, len(reconciled_signals))
    with _detector_step("persist_reconciled_signals", document_id=document_id, count=len(reconciled_signals)):
        for signal in reconciled_signals:
            persist_signal(signal)
    validated_signals.extend(reconciled_signals)

    # Some extractors identify the EW on one assertion in a document but not
    # on neighboring assertions. Propagate only a single unambiguous document
    # identity; documents mentioning multiple EWs remain paragraph-scoped.
    document_assertions = [
        assertion for assertion in store.assertions.values()
        if assertion.source_document_id == document.id
    ]
    document_ew_ids = {assertion_scope(assertion) for assertion in document_assertions if assertion_scope(assertion)}
    if len(document_ew_ids) == 1:
        document_ew_id = next(iter(document_ew_ids))
        new_extra_work_ids.add(document_ew_id)
        for assertion in document_assertions:
            if assertion.extra_work_id:
                continue
            assertion.extra_work_id = document_ew_id
            if isinstance(assertion.value, dict):
                assertion.value["extra_work_id"] = document_ew_id

    matter_id = document.metadata.get("matter_id")
    if matter_id:
        logger.info("[detector] legal analysis started document_id=%s matter_id=%s", document_id, matter_id)
        matched_issue_ids = match_new_evidence(new_assertion_ids)
        logger.info(
            "[detector] new evidence matched existing issues document_id=%s issue_ids=%s",
            document_id, sorted(matched_issue_ids),
        )
        if not store.rule_specs:
            logger.info("[detector] registering default executable rules")
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
        logger.info("[detector] legal inputs loaded document_id=%s obligations=%d assertions=%d approved_rules=%d", document_id, len(obligations), len(assertions), len(rules))
        with _detector_step("activate_rules", document_id=document_id, rule_count=len(rules), assertion_count=len(assertions)):
            activations = activate_rules(rules=rules, assertions=assertions)
        logger.info("[detector] rules activated document_id=%s activation_count=%d", document_id, len(activations))
        with _detector_step("discover_issues", document_id=document_id):
            issues = discover_issues(
                tenant_id=document.tenant_id or "unassigned",
                matter_id=matter_id,
                obligations=obligations,
                assertions=assertions,
                rules=rules,
                activations=activations,
            )
        logger.info("[detector] issues discovered document_id=%s issue_count=%d", document_id, len(issues))
        affected_issue_ids = determine_assertion_affected_issues(new_assertion_ids) | matched_issue_ids
        issues_to_reconcile = [
            issue for issue in issues
            if issue.id in affected_issue_ids
            or issue.current_assessment_id is None
            or (issue.extra_work_id and issue.extra_work_id in new_extra_work_ids)
        ]
        logger.info(
            "[detector] targeted issue reconciliation document_id=%s affected=%d skipped=%d",
            document_id, len(issues_to_reconcile), len(issues) - len(issues_to_reconcile),
        )
        for issue in issues_to_reconcile:
            logger.info("[detector] issue started issue_id=%s issue_scope=%s rule_ids=%s", issue.id, issue.issue_scope, issue.rule_ids)
            issue_rules = [rule for rule in rules if rule.id in issue.rule_ids]
            if len(issue_rules) > 1:
                # This is a legacy/corrupt aggregate. Do not silently execute
                # only the first rule and present incomplete legal analysis.
                logger.error(
                    "[detector] issue has multiple rules; skipping aggregate issue_id=%s rule_ids=%s",
                    issue.id, issue.rule_ids,
                )
                continue
            issue_rule = issue_rules[0] if issue_rules else None
            targeted_assertions: list[EvidenceAssertion] = []
            targeted_searches = []
            if issue_rule:
                with _detector_step("retrieve_requirement_evidence", issue_id=issue.id, rule_id=issue_rule.id):
                    targeted_assertions, targeted_searches = retrieve_requirement_evidence(
                        issue=issue,
                        rule=issue_rule,
                        assertions=assertions,
                        analysis_run_id=analysis_run_id,
                    )
                issue.evidence_ids = sorted(set(issue.evidence_ids + [a.id for a in targeted_assertions]))
            logger.info("[detector] targeted evidence complete issue_id=%s assertions=%d searches=%d", issue.id, len(targeted_assertions), len(targeted_searches))
            with _detector_step("reconcile_issue", issue_id=issue.id):
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
            logger.info("[detector] issue finished issue_id=%s", issue.id)
    else:
        logger.warning("[detector] no matter_id; legal issue analysis skipped document_id=%s", document_id)

    with _detector_step("determine_affected_nodes", document_id=document_id):
        affected_nodes = determine_affected_nodes([signal.signal_type for signal in validated_signals])
    logger.info("[detector] affected nodes determined document_id=%s count=%d", document_id, len(affected_nodes))
    with _detector_step("recompute_nodes", document_id=document_id, change_event_id=change_event_match.change_event_id):
        node_states = recompute_nodes(change_event_match.change_event_id, affected_nodes)
    if change_event_match.change_event_id:
        with _detector_step("update_risk_factors", document_id=document_id):
            factors = update_risk_factors(change_event_match.change_event_id, node_states)
        with _detector_step("update_risk_tickets", document_id=document_id):
            update_risk_tickets(change_event_match.change_event_id, factors)
    result = "waiting_for_review" if needs_review else "completed"
    logger.info("[detector] document pipeline finished document_id=%s result=%s", document_id, result)
    return result
