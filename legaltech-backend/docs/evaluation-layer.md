# Evaluation Layer

The evaluation layer runs sparse, original-file cases through the production
pipeline. A case only records the behavior it is intended to test; it is not a
complete gold database.

## Case layout

```text
eval_cases/case_b/
  documents/
    03_daily_report.txt
    04_invoice.txt
  expected.json
```

`expected.json` may contain requirement, source, and semantic checks:

Document types can be made explicit with a filename mapping:

```json
{"document_types": {"01_scope_request.txt": "email", "02_owner_proceed_only.txt": "email"}}
```

`run_file_case()` runs each case in a spawned child process by default, so the
in-memory singleton is not shared with the caller or another case. Use
`isolated=False` only for local debugging.

Semantic signal extraction is AI-first. The pipeline retains only deterministic
project/PO identifier parsing when AI extraction is disabled or unavailable; it
does not turn arbitrary wording into legal facts through keyword heuristics.
AI candidates are accepted only when their source excerpt, signal type, Extra
Work identity, polarity, and temporal status pass validation.

Requirement checks may include `extra_work_id`; this is required whenever the
same requirement is evaluated for more than one Extra Work. Supported
deterministic checks also include `time_order`, `uncertainty_reason`,
`conflict_classification`, and `cross_ew_isolation`.

```json
{
  "case_id": "B",
  "checks": [
    {"id": "B01", "type": "requirement_status", "requirement": "owner_approved_additional_cost", "expected": "INSUFFICIENT_INFORMATION"},
    {"id": "B02", "type": "forbidden_source", "requirement": "owner_approved_additional_cost", "document": "04_invoice.txt"},
    {"id": "B03", "type": "required_source", "requirement": "work_performed", "document": "03_daily_report.txt"},
    {"id": "B04", "type": "llm_judge", "match_criteria": "Do not infer that missing price approval eliminates all compensation rights."}
  ]
}
```

## Python API

```python
from app.evals.runner import evaluate_file_case

report = evaluate_file_case("eval_cases/case_b")
```

The runner resets the in-memory store and uses an isolated temporary storage
directory. It records observable extraction, matching, retrieval, requirement,
and reconciliation results. A semantic criterion fails as ungraded unless an
independent judge is explicitly supplied.

Deterministic source checks validate document identity and evidence links. They
do not decide whether the cited text legally proves a requirement; that is the
semantic Judge's responsibility and remains reviewable.

Failure stages are conservative. The report uses `UNKNOWN` when the available
stage observations cannot prove the earliest failing stage.
