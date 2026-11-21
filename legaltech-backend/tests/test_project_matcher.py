from app.matching.project_matcher import resolve_project
from app.models import Document, Matter, Project
from app.models.domain import DocumentType
from app.parsers.base import ParsedContent
from app.repositories.memory import store


def test_project_matcher_scopes_duplicate_project_number_to_document_matter() -> None:
    store.reset()
    old_matter = Matter(name="Old case")
    new_matter = Matter(name="CO-02")
    store.matters[old_matter.id] = old_matter
    store.matters[new_matter.id] = new_matter
    old_project = Project(matter_id=old_matter.id, name="Old PRJ-502", project_number="PRJ-502")
    new_project = Project(matter_id=new_matter.id, name="New PRJ-502", project_number="PRJ-502")
    store.projects[old_project.id] = old_project
    store.projects[new_project.id] = new_project
    document = Document(
        document_type=DocumentType.email,
        file_hash="fixture",
        storage_path="fixture",
        matter_id=new_matter.id,
        metadata={"matter_id": new_matter.id, "original_filename": "02_proceed_message.txt"},
    )

    match = resolve_project(document, ParsedContent(document_id=document.id, text="PRJ-502 go ahead with EW-502"))

    assert match.project_id == new_project.id
    assert match.matter_id == new_matter.id
