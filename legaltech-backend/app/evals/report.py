"""JSON and Markdown reports for evaluation runs."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def build_report(result: dict[str, Any], rubric: dict[str, Any]) -> dict[str, Any]:
    return {
        "case_id": result.get("case_id"),
        "metadata": result.get("metadata", {}),
        "score": rubric.get("score", 0.0),
        "criteria_passed": rubric.get("passed", 0),
        "criteria_total": rubric.get("total", 0),
        "all_pass": rubric.get("all_pass", False),
        "criteria": rubric.get("criteria", []),
        "stages": result.get("stages", {}),
    }


def write_report(report: dict[str, Any], output: str | Path) -> Path:
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() == ".md":
        path.write_text(to_markdown(report), encoding="utf-8")
    else:
        path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def to_markdown(report: dict[str, Any]) -> str:
    lines = [f"# Evaluation Report — {report.get('case_id')}", "", f"Score: {report.get('criteria_passed')}/{report.get('criteria_total')}", "", "## Criteria", ""]
    for item in report.get("criteria", []):
        verdict = "PASS" if item.get("passed") else "FAIL"
        lines.append(f"- **{verdict}** `{item.get('id')}` — {item.get('type')} — stage: `{item.get('failure_stage', 'UNKNOWN')}`")
        if item.get("reason"):
            lines.append(f"  - {item['reason']}")
        semantic = item.get("semantic") or {}
        if semantic.get("reasoning"):
            lines.append(f"  - Judge: {semantic['reasoning']}")
    return "\n".join(lines) + "\n"
