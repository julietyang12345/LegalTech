"""Run sparse, original-file evaluation cases through the real pipeline."""

from __future__ import annotations

import json
import multiprocessing
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.ingestion import upload_ingestor
from app.ingestion.upload_ingestor import ingest_upload
from app.jobs.worker import run_once
from app.models import ChangeEvent, Matter, Project
from app.models.domain import DocumentType
from app.repositories.memory import store
from app.evals.rubric import CriterionJudge, evaluate_rubric
from app.evals.report import build_report


@dataclass(frozen=True)
class FileCase:
    case_id: str
    directory: Path
    checks: list[dict[str, Any]]
    document_types: dict[str, str] | None = None
    tenant_id: str = "EVAL-TENANT"
    matter_id: str | None = None
    project: dict[str, Any] | None = None
    change_events: list[dict[str, Any]] | None = None

    def __post_init__(self) -> None:
        if self.matter_id is None:
            object.__setattr__(self, "matter_id", f"EVAL-{self.case_id}")

    @classmethod
    def load(cls, directory: str | Path) -> "FileCase":
        path = Path(directory)
        config = json.loads((path / "expected.json").read_text(encoding="utf-8"))
        case_id = config.get("case_id") or path.name
        return cls(
            case_id=case_id,
            directory=path,
            checks=config.get("checks", []),
            document_types=config.get("document_types", {}),
            tenant_id=config.get("tenant_id", "EVAL-TENANT"),
            matter_id=config.get("matter_id") or f"EVAL-{case_id}",
            project=config.get("project"),
            change_events=config.get("change_events", []),
        )


def run_file_case(case: FileCase | str | Path, *, isolated: bool = True) -> dict[str, Any]:
    if not isinstance(case, FileCase):
        case = FileCase.load(case)
    if isolated:
        context = multiprocessing.get_context("spawn")
        with context.Pool(processes=1) as pool:
            return pool.apply(_run_file_case_local, (case,))
    return _run_file_case_local(case)


def _run_file_case_local(case: FileCase) -> dict[str, Any]:
    """Ingest every document in a case and return observable pipeline state."""
    store.reset()
    matter = Matter(name=case.case_id, id=case.matter_id, tenant_id=case.tenant_id)
    store.matters[matter.id] = matter
    if case.project:
        project = Project(
            matter_id=case.matter_id,
            name=case.project.get("name", case.case_id),
            project_number=case.project.get("project_number"),
            site_address=case.project.get("site_address"),
        )
        store.projects[project.id] = project
        for fixture in case.change_events or []:
            event = ChangeEvent(
                project_id=project.id,
                title=fixture.get("title", fixture.get("id", "Evaluation change event")),
                status=fixture.get("status", "active"),
            )
            store.change_events[event.id] = event
    with tempfile.TemporaryDirectory(prefix=f"legaltech-eval-{case.case_id}-") as storage:
        original_root = upload_ingestor.STORAGE_ROOT
        upload_ingestor.STORAGE_ROOT = Path(storage)
        try:
            documents = sorted(
                item for item in (case.directory / "documents").iterdir()
                if item.is_file() and item.name != "expected.json"
            )
            document_ids: dict[str, str] = {}
            for path in documents:
                document_type = _document_type(path, case.document_types.get(path.name) if case.document_types else None)
                document, _job = ingest_upload(
                    content=path.read_bytes(),
                    filename=path.name,
                    document_type=document_type,
                    matter_id=case.matter_id,
                    tenant_id=case.tenant_id,
                )
                document_ids[path.name] = document.id
            while run_once():
                pass
            jobs = [job for job in store.jobs.values() if job.document_id in document_ids.values()]
            failed = [job for job in jobs if job.status.value == "failed"]
            unfinished = [job for job in jobs if job.status.value in {"pending", "processing"}]
            if failed or unfinished or len(jobs) != len(document_ids):
                details = [
                    {"document_id": job.document_id, "status": job.status.value, "error": job.error_message}
                    for job in jobs
                ]
                raise RuntimeError(f"Evaluation case {case.case_id} did not finish all jobs: {details}")
            return _snapshot(case, document_ids)
        finally:
            upload_ingestor.STORAGE_ROOT = original_root


def evaluate_file_case(
    case: FileCase | str | Path,
    judge: CriterionJudge | None = None,
) -> dict[str, Any]:
    """Run a case, apply its sparse rubric, and return a report-ready result."""
    result = run_file_case(case)
    return build_report(result, evaluate_rubric(result, judge=judge))


def _document_type(path: Path, configured: str | None = None) -> DocumentType:
    if configured is not None:
        try:
            return DocumentType(configured)
        except ValueError as error:
            raise ValueError(f"Unknown document type {configured!r} for {path.name}") from error
    name = path.name.lower()
    if "invoice" in name:
        return DocumentType.invoice
    if "contract" in name:
        return DocumentType.contract
    if "daily" in name or "report" in name:
        return DocumentType.daily_report
    if "change" in name or "approval" in name:
        return DocumentType.change_order
    if "email" in name or path.suffix.lower() in {".eml", ".msg"}:
        return DocumentType.email
    return DocumentType.unknown


def _snapshot(case: FileCase, document_ids: dict[str, str]) -> dict[str, Any]:
    documents = {name: document_ids[name] for name in document_ids}
    assertions = [a for a in store.assertions.values() if a.matter_id == case.matter_id]
    issues = [i for i in store.issues.values() if i.matter_id == case.matter_id]
    assessments = [a for a in store.assessments.values() if a.matter_id == case.matter_id and a.is_current]
    checks = [check for assessment in assessments for check in assessment.requirement_checks]
    document_for_assertion = {
        assertion.id: next((name for name, ident in document_ids.items() if ident == assertion.source_document_id), assertion.source_document_id)
        for assertion in assertions
    }
    return {
        "case_id": case.case_id,
        "documents": documents,
        "stages": {
            "extraction": [{"document": document_for_assertion.get(a.id), "assertion_id": a.id, "type": a.assertion_type} for a in assertions],
            "evidence_matching": [{"issue_id": i.id, "extra_work_id": i.extra_work_id, "evidence_ids": i.evidence_ids} for i in issues],
            "retrieval": [{
                "issue_id": i.id,
                "search_attempt_ids": [s.id for s in store.search_attempts.values() if s.issue_id == i.id],
                "coverage": [s.model_dump(mode="json") for s in store.search_attempts.values() if s.issue_id == i.id],
            } for i in issues],
            "requirement_evaluation": [check.model_dump(mode="json") for check in checks],
            "reconciliation": [{"issue_id": a.issue_id, "assessment_id": a.id, "status": a.status.value} for a in assessments],
        },
        "assertions": [a.model_dump(mode="json") for a in assertions],
        "checks": case.checks,
        "analysis": {
            "issues": [i.model_dump(mode="json") for i in issues],
            "assessments": [a.model_dump(mode="json") for a in assessments],
            "requirement_checks": [check.model_dump(mode="json") for check in checks],
        },
        "metadata": {
            "analysis_statuses": sorted({job.analysis_status for job in store.jobs.values() if job.document_id in document_ids.values()}),
            "analysis_reasons": sorted({job.analysis_reason for job in store.jobs.values() if job.document_id in document_ids.values() and job.analysis_reason}),
            "pipeline_versions": sorted({job.pipeline_version for job in store.jobs.values() if job.document_id in document_ids.values()}),
            "analysis_run_ids": sorted({p.analysis_run_id for p in store.provenance.values() if p.matter_id == case.matter_id}),
        },
    }
