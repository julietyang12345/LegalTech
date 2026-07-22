from fastapi import APIRouter
from pydantic import BaseModel

from app.models import ChangeEvent, Matter, Project
from app.repositories.memory import store

router = APIRouter()


class CreateMatterRequest(BaseModel):
    name: str
    organization_id: str | None = None


class CreateProjectRequest(BaseModel):
    name: str
    project_number: str | None = None
    site_address: str | None = None


@router.get("")
def list_matters() -> list[Matter]:
    return list(store.matters.values())


@router.post("")
def create_matter(payload: CreateMatterRequest) -> Matter:
    matter = Matter(name=payload.name, organization_id=payload.organization_id)
    store.matters[matter.id] = matter
    return matter


@router.get("/{matter_id}")
def get_matter(matter_id: str) -> dict:
    projects = [project for project in store.projects.values() if project.matter_id == matter_id]
    project_ids = {project.id for project in projects}
    change_events = [
        change_event
        for change_event in store.change_events.values()
        if change_event.project_id in project_ids
    ]
    return {
        "matter": store.matters.get(matter_id),
        "projects": projects,
        "change_events": change_events,
    }


@router.post("/{matter_id}/projects")
def create_project(matter_id: str, payload: CreateProjectRequest) -> Project:
    project = Project(
        matter_id=matter_id,
        name=payload.name,
        project_number=payload.project_number,
        site_address=payload.site_address,
    )
    store.projects[project.id] = project
    return project


@router.get("/{matter_id}/timeline")
def get_matter_timeline(matter_id: str) -> list[dict]:
    return [
        event.model_dump()
        for event in sorted(store.events.values(), key=lambda item: item.occurred_at)
        if event.matter_id == matter_id
    ]
