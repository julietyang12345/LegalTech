from pydantic import BaseModel, Field

from app.models import Document, Project
from app.parsers.base import ParsedContent
from app.repositories.memory import store


class ProjectMatch(BaseModel):
    project_id: str | None
    matter_id: str | None
    confidence: float
    reasons: list[str] = Field(default_factory=list)
    status: str


def resolve_project(document: Document, parsed_content: ParsedContent) -> ProjectMatch:
    scored: list[tuple[float, list[str], Project]] = []
    text = parsed_content.text.lower()

    for project in store.projects.values():
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
        return ProjectMatch(project_id=None, matter_id=None, confidence=0.0, status="unlinked")

    confidence, reasons, project = sorted(scored, key=lambda item: item[0], reverse=True)[0]
    status = "auto_linked" if confidence >= 0.9 else "needs_review"
    return ProjectMatch(project_id=project.id, matter_id=project.matter_id, confidence=confidence, reasons=reasons, status=status)


def _feedback_boost(sender: str | None, project_id: str) -> float:
    if not sender:
        return 0.0
    for feedback in store.match_feedback.values():
        if feedback.selected_project_id == project_id and feedback.features.get("sender") == sender:
            return 0.2
    return 0.0
