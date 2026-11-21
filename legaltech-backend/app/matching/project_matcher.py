import logging

from pydantic import BaseModel, Field

from app.models import Document, Project
from app.parsers.base import ParsedContent
from app.repositories.memory import store

logger = logging.getLogger(__name__)


class ProjectMatch(BaseModel):
    project_id: str | None
    matter_id: str | None
    confidence: float
    reasons: list[str] = Field(default_factory=list)
    status: str


def resolve_project(document: Document, parsed_content: ParsedContent) -> ProjectMatch:
    scored: list[tuple[float, list[str], Project]] = []
    text = parsed_content.text.lower()
    requested_matter_id = document.matter_id or document.metadata.get("matter_id")
    candidate_projects = [
        project for project in store.projects.values()
        if not requested_matter_id or project.matter_id == requested_matter_id
    ]
    if requested_matter_id and not candidate_projects:
        logger.warning(
            "[matcher] document matter has no projects document_id=%s matter_id=%s",
            document.id, requested_matter_id,
        )
        return ProjectMatch(project_id=None, matter_id=requested_matter_id, confidence=0.0, status="unlinked")

    for project in candidate_projects:
        score = 0.0
        reasons: list[str] = []
        if project.project_number and project.project_number.lower() in text:
            score += 0.55
            reasons.append("project number")
        if project.site_address and project.site_address.lower() in text:
            score += 0.25
            reasons.append("site address")
        score += _feedback_boost(document.sender, project.id)
        if score > 0:
            scored.append((min(score, 0.99), reasons, project))

    if not scored:
        logger.warning(
            "[matcher] no project candidate document_id=%s matter_id=%s known_projects=%d",
            document.id, requested_matter_id, len(candidate_projects),
        )
        return ProjectMatch(project_id=None, matter_id=None, confidence=0.0, status="unlinked")

    confidence, reasons, project = sorted(scored, key=lambda item: item[0], reverse=True)[0]
    status = "auto_linked" if confidence >= 0.9 else "needs_review"
    logger.info(
        "[matcher] project selected document_id=%s requested_matter_id=%s project_id=%s project_matter_id=%s confidence=%.2f status=%s candidates=%d",
        document.id, requested_matter_id, project.id, project.matter_id,
        confidence, status, len(scored),
    )
    return ProjectMatch(project_id=project.id, matter_id=project.matter_id, confidence=confidence, reasons=reasons, status=status)


def _feedback_boost(sender: str | None, project_id: str) -> float:
    if not sender:
        return 0.0
    for feedback in store.match_feedback.values():
        if feedback.selected_project_id == project_id and feedback.features.get("sender") == sender:
            return 0.2
    return 0.0
