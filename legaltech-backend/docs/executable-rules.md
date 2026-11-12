# Executable Legal Rules

The first vertical slice treats legal knowledge as two versioned objects:

1. `LegalPrinciple` records the source-supported principle, jurisdiction, and approval status.
2. `ExecutableRuleSpec` records when to activate a check, what evidence to search for, how each requirement is evaluated, exceptions, and the review policy.

Runtime analysis never writes project facts back into a rule. It creates a separate `RuleActivation`, `Issue`, `RequirementCheck`, and versioned `Assessment`.

```text
LegalPrinciple + ExecutableRuleSpec
  -> RuleActivation (trigger != applicability)
  -> Issue (one issue_scope per extra work / event)
  -> RequirementCheck (supporting, contrary, search coverage)
  -> Assessment (versioned, source-linked, lawyer-reviewable)
```

The seeded `EXTRA_WORK_COST_COMMUNICATION` rule is a candidate contract for engineering tests. Its jurisdiction is `REQUIRES_VERIFICATION`; it must not be treated as a binding legal standard without matter-specific lawyer approval.

Important invariants:

- Discovery triggers can activate a candidate check before all assessment preconditions exist.
- Requirement results are independent; missing evidence is not proof of non-occurrence.
- `Please proceed` does not establish approval of additional cost by itself.
- Negative approval language is contrary evidence.
- Working-day deadlines are calculated separately from calendar-day deadlines.
- A changed rule version identifies downstream issues and assessments for targeted reanalysis.
