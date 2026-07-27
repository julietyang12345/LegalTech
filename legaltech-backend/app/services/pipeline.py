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

    extracted_signals = extract_atomic_signals(document, parsed_content)
    for signal in extracted_signals:
        signal.change_event_id = change_event_match.change_event_id

    validated_signals = validate_signals(document, extracted_signals)
    for signal in validated_signals:
        key = f"{signal.source_document_id}:{signal.signal_type}:{signal.source_text_hash}"
        store.signals[key] = signal

    reconciled_signals = reconcile_cross_document_signals(
        document,
        parsed_content,
        change_event_match.change_event_id,
    )
    for signal in reconciled_signals:
        key = f"{signal.source_document_id}:{signal.signal_type}:{signal.source_text_hash}"
        store.signals[key] = signal
    validated_signals.extend(reconciled_signals)

    affected_nodes = determine_affected_nodes([signal.signal_type for signal in validated_signals])
    node_states = recompute_nodes(change_event_match.change_event_id, affected_nodes)
    if change_event_match.change_event_id:
        factors = update_risk_factors(change_event_match.change_event_id, node_states)
        update_risk_tickets(change_event_match.change_event_id, factors)
    return "waiting_for_review" if needs_review else "completed"
