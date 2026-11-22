import logging
import os
import re
from contextlib import contextmanager
from time import perf_counter

from app.analysis.dependency_graph import determine_assertion_affected_issues
from app.analysis.evidence_issue_matching import match_new_evidence
from app.decision_engine.dependencies import determine_affected_nodes
from app.decision_engine.evaluator import recompute_nodes
from app.extraction.ai_signal_extractor import document_date
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
from app.core.config import get_settings
from app.legal_knowledge.default_rules import default_rule_set
from app.legal_knowledge.rule_registry import register_rule
from app.legal_knowledge.ai_rule_discovery import discover_rule_candidates
from app.services.hashing import stable_text_hash
from app.analysis.event_time import normalize_event_time
from app.models.domain import DocumentType

PIPELINE_VERSION = "0.1.0"
logger = logging.getLogger(__name__)


_HEADER_FIELDS = {"from": "from", "to": "to", "cc": "cc", "subject": "subject", "date sent": "date_sent", "sent": "date_sent"}
_HEADER_LINE = re.compile(r"^\s*(from|to|cc|subject|date sent|sent)\s*:\s*(.+?)\s*$", re.IGNORECASE)


def correspondence_header(text: str) -> dict[str, str]:
    """From/To/Subject lines stated at the top of the document text.

    Uploads carry no trustworthy sender metadata, so who wrote to whom is read
    from the document itself. Only the first lines are scanned so quoted
    replies further down cannot overwrite the header.
    """
    header: dict[str, str] = {}
    for line in text.splitlines()[:25]:
        match = _HEADER_LINE.match(line)
        if match:
            header.setdefault(_HEADER_FIELDS[match.group(1).lower()], match.group(2)[:200])
    return header


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
    # Flat string keys: document metadata is passed to ParsedContent, which
    # only accepts string values.
    for field, value in correspondence_header(parsed_content.text or "").items():
        document.metadata[f"header_{field}"] = value
    stated_document_date = document_date(parsed_content.text or "")
    if stated_document_date:
        document.metadata["document_date"] = stated_document_date.isoformat()
    if document.document_type.value == "contract":
        discover_rule_candidates(
            document_id=document.id,
            text=parsed_content.text,
            tenant_id=document.tenant_id or "unassigned",
            matter_id=document.matter_id or document.metadata.get("matter_id") or "unassigned",
            analysis_run_id=f"RUN-{stable_text_hash(document_id + PIPELINE_VERSION)[:12].upper()}",
        )
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
    semantic_signals = [
        signal for signal in validated_signals
        if signal.signal_type not in {"project_number", "po_number"}
    ]
    settings = get_settings()
    if not settings.ai_extraction_enabled or not settings.openai_api_key:
        document.metadata["analysis_status"] = "ANALYSIS_INCOMPLETE"
        document.metadata["analysis_reason"] = "AI extraction is disabled or OPENAI_API_KEY is unavailable."
    elif not semantic_signals and document.document_type != DocumentType.contract:
        # Contract text is normative: obligations come from clause parsing,
        # so zero project-fact signals is expected, not a failed analysis.
        document.metadata["analysis_status"] = "ANALYSIS_INCOMPLETE"
        document.metadata["analysis_reason"] = "AI extraction returned no validated semantic signals."
    else:
        document.metadata["analysis_status"] = "COMPLETE"
        document.metadata.pop("analysis_reason", None)
    logger.info(
        "[detector] analysis status document_id=%s status=%s reason=%s",
        document_id, document.metadata["analysis_status"], document.metadata.get("analysis_reason"),
    )
    def persist_signal(signal):
        signal.tenant_id = document.tenant_id or "unassigned"
        provenance = record_provenance(
            Provenance(
                tenant_id=document.tenant_id or "unassigned",
                matter_id=document.metadata.get("matter_id") or "unassigned",
                source_document_ids=[document.id],
                analysis_run_id=analysis_run_id,
                pipeline_version=PIPELINE_VERSION,
                method="ai_extraction_or_deterministic_metadata",
                rationale="Candidate interpretation linked to source text; not a verified fact.",
            )
        )
        signal.provenance_id = provenance.id
        assertion_id = f"ASSERT-{signal.id}"
        extra_work_id = infer_extra_work_id(signal.value, signal.source_text)
        tenant_id = document.tenant_id or "unassigned"
        matter_id = document.matter_id or document.metadata.get("matter_id") or "unassigned"
        if extra_work_id:
            extra_work = store.find_extra_work(
                tenant_id=tenant_id,
                matter_id=matter_id,
                external_id=extra_work_id,
            )
            if extra_work is None:
                extra_work = ExtraWork(
                    tenant_id=tenant_id,
                    matter_id=matter_id,
                    external_id=extra_work_id,
                    title=_extra_work_title(document, signal.source_text, change_event_match.change_event_id),
                )
                store.extra_works[extra_work.id] = extra_work
            elif _looks_like_header(extra_work.title):
                extra_work.title = _extra_work_title(document, signal.source_text, change_event_match.change_event_id)
            amount = _signal_amount(signal.value)
            if signal.signal_type in {"invoice_amount", "estimate_amount", "approved_amount"} and amount is not None:
                # Keep legacy proposed_amount populated while preserving the
                # semantic distinction needed by the dashboard.
                extra_work.proposed_amount = amount
                if signal.signal_type == "invoice_amount":
                    extra_work.claimed_amount = amount
                elif signal.signal_type == "estimate_amount":
                    extra_work.estimated_amount = amount
                elif signal.signal_type == "approved_amount":
                    extra_work.approved_amount = amount
                extra_work.currency = "USD"
        if extra_work_id:
            new_extra_work_ids.add(extra_work_id)
        assertion_value = dict(signal.value) if isinstance(signal.value, dict) else {
            "value": signal.value,
            "change_event_id": change_event_match.change_event_id,
        }
        assertion_value.setdefault("change_event_id", change_event_match.change_event_id)
        if extra_work_id:
            assertion_value["extra_work_id"] = extra_work_id
        raw_event_at = assertion_value.get("event_at") if isinstance(assertion_value.get("event_at"), str) else None
        model_event_at = raw_event_at
        raw_event_at, time_source = fact_event_at(
            signal.signal_type, signal.source_text, raw_event_at, document.metadata.get("document_date"),
        )
        if raw_event_at != model_event_at:
            assertion_value["model_event_at"] = model_event_at
            assertion_value["event_at"] = raw_event_at
        normalized_time = normalize_event_time(raw_event_at, reference_at=document.received_at)
        event_at = normalized_time.raw_value
        event_iso = normalized_time.iso_value
        raw_document_sent_at = assertion_value.get("document_sent_at") if isinstance(assertion_value.get("document_sent_at"), str) else None
        normalized_document_sent_at = normalize_event_time(raw_document_sent_at, reference_at=document.received_at)
        communication_types = {"cost_communication", "pricing_unresolved", "written_notice", "estimate_amount"}
        approval_types = {"price_approval", "approved_amount", "signed_change_order", "express_authorization"}
        assertion_type = _normalize_assertion_type(signal.signal_type, signal.source_text)
        store.assertions[assertion_id] = EvidenceAssertion(
            id=assertion_id,
            conversation_id=document.metadata.get("conversation_id"),
            tenant_id=tenant_id,
            matter_id=matter_id,
            source_document_id=signal.source_document_id,
            extra_work_id=extra_work_id,
            evidence_role=evidence_role_for_document(document),
            assertion_type=assertion_type,
            statement=signal.source_text,
            value=assertion_value,
            actor=signal.actor,
            event_at=event_at,
            communication_at=event_iso if signal.signal_type in communication_types else None,
            work_planned_at=event_iso if signal.signal_type == "work_planned" else None,
            work_start_at=event_iso if signal.signal_type == "work_performed" else None,
            work_completed_at=event_iso if signal.signal_type == "work_completed" else None,
            approval_at=event_iso if signal.signal_type in approval_types else None,
            price_communicated_at=event_iso if signal.signal_type in communication_types else None,
            price_approved_at=event_iso if signal.signal_type in approval_types else None,
            document_sent_at=normalized_document_sent_at.iso_value,
            uploaded_at=document.received_at,
            time_source=time_source,
            time_confidence=normalized_time.confidence,
            relationship_status="EXPLICIT" if extra_work_id else "UNSCOPED",
            relationship_reason="EW identifier extracted from source or document metadata" if extra_work_id else "No unambiguous Extra Work identifier found",
            scope_confidence="HIGH" if extra_work_id else "UNKNOWN",
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
            assertion.relationship_status = "INFERRED"
            assertion.relationship_reason = "Document contained one unambiguous Extra Work identifier"
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
                assessment = reconcile_issue(
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
                if any(not check.analysis_complete for check in assessment.requirement_checks):
                    document.metadata["analysis_status"] = "ANALYSIS_INCOMPLETE"
                    document.metadata["analysis_reason"] = (
                        "Semantic evaluation did not classify every relevant evidence item."
                    )
                    logger.warning(
                        "[detector] semantic analysis incomplete document_id=%s issue_id=%s",
                        document_id, issue.id,
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


WORK_SIGNAL_TYPES = {"work_performed", "work_completed", "work_planned", "installation", "construction_started"}
SIGNATURE_SIGNAL_TYPES = {"signed_change_order", "price_approval", "approved_amount", "express_authorization", "written_authorization"}
_STATED_DATE = re.compile(r"\b[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b")


def fact_event_at(signal_type: str, statement: str, model_event_at: str | None, document_date_iso: str | None) -> tuple[str | None, str]:
    """When the fact an assertion records happened, and where that date came from.

    A sentence can mention dates other than its own. "CO ... including work
    performed April 9-10" is a document dated April 14 that recites earlier
    work, so only work facts keep the date the model read from the sentence.
    A signature line carries its own date ("/s/ <name>, <date>").
    Every other fact (letters, estimates, directions, CO terms) happened on
    the date the document states in its header.
    """
    if signal_type in WORK_SIGNAL_TYPES:
        return model_event_at, "SOURCE_TEXT" if model_event_at else "UNKNOWN"
    if signal_type in SIGNATURE_SIGNAL_TYPES:
        stated = _STATED_DATE.findall(statement or "")
        if len(stated) == 1:
            return stated[0], "SOURCE_TEXT"
    if document_date_iso:
        return document_date_iso, "DOCUMENT_DATE"
    return model_event_at, "SOURCE_TEXT" if model_event_at else "UNKNOWN"


def _signal_amount(value) -> float | None:
    raw = value.get("value") if isinstance(value, dict) else value
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    return None


def _extra_work_title(document, source_text: str, change_event_id: str | None) -> str:
    """Use a human subject/scope title, never a raw mail header prefix."""
    subject = (document.subject or "").strip()
    subject_lower = subject.lower()
    header_like = _looks_like_header(subject)
    if subject and not header_like and subject_lower not in {"none", "unknown"} and not subject_lower.endswith((".txt", ".pdf", ".docx")):
        return subject[:160]
    if change_event_id:
        change_event = store.change_events.get(change_event_id)
        if change_event and change_event.title and "cost communication" not in change_event.title.lower():
            return change_event.title[:160]
    subject_match = re.search(r"(?im)^subject:\s*(.+)$", source_text)
    if subject_match:
        return subject_match.group(1).strip()[:160]
    cleaned = re.sub(r"(?is)^project correspondence\s*", "", source_text).strip()
    return cleaned[:160] or "Extra Work"


def _looks_like_header(value: str | None) -> bool:
    normalized = (value or "").strip().lower()
    return normalized.startswith("project correspondence") or (
        "project:" in normalized and "date sent:" in normalized
    )


def _normalize_assertion_type(signal_type: str, source_text: str) -> str:
    """Upgrade unmistakable signed CO evidence from a generic AI label.

    The generic formal-document label is useful for discovery, but it cannot
    satisfy the approval requirement. Both signatures and the change-order
    form must be present before making this narrow normalization.
    """
    normalized = source_text.lower()
    if (
        signal_type == "formal_change_document"
        and "change order" in normalized
        and "owner signature" in normalized
        and "contractor signature" in normalized
        and "/s/" in normalized
    ):
        return "signed_change_order"
    return signal_type
