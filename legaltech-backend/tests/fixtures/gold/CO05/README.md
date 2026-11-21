# CO-05 | Late Executed Change Order

**Synthetic test fixture.** Invented people, events and contract terms. This is a draft test expectation pending legal / project expert review.

**Scenario:** Initial approval gap; later signed priced CO covers earlier work but timing compliance still merits review.

**Key variation tested:** Temporal updating / partial resolution

**Project:** PRJ-505 · Gardenview Hospital - Service Chase

**Extra work scopes:** EW-505

## How to run

1. Start your existing FastAPI backend. Create a separate Matter for each run.
2. From this case directory run `python upload_case.py` to upload all documents and process jobs.
3. For an as-of-time test, run `python upload_case.py --through YYYY-MM-DD` (for example `--through 2026-04-08`). This creates a separate Matter containing only documents available by the cutoff.
4. Only the files under `UPLOAD/` are test input; **never upload `expected_results.json`**.
5. Compare issues, evidence attribution, scope linking and actions to `expected_results.json` manually or with a custom adapter. The original eval harness does not automatically load these fixtures.

## Expected temporal checkpoints

- **As of 2026-04-08T23:59 → POTENTIAL_RISK**: Price and scope are proposed but the contract-required executed priced CO is not yet available; changed work is authorized to begin.
- **As of 2026-04-14T23:59 → RESOLVED**: A signed priced CO now documents the amount and earlier scope. It does not erase the historical fact that work preceded the signed form; timing consequences require review.

## Critical mistakes to avoid
- Maintain an unresolved missing-priced-CO alert after April 14
- State work was authorized by signed CO before April 9
- Claim a later signature conclusively cures all past contractual noncompliance

## Notes

- Upload order is chronological using `manifest.json` and names, not all files are intended to have been available on day one.
- `--through` creates a new Matter per run. To test true incremental updates to the *same* Matter, add documents to that Matter in chronological order using your UI or adapter.
- Do not treat synthetic expected labels as validated legal advice or as proof of recovery or forfeiture.
