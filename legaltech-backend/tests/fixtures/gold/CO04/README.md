# CO-04 | Express Rejection Then Work

**Synthetic test fixture.** Invented people, events and contract terms. This is a draft test expectation pending legal / project expert review.

**Scenario:** Owner rejects quoted price; separate scheduling directive leads to work proceeding.

**Key variation tested:** Negation, distinct work and price decisions

**Project:** PRJ-504 · Willow Arts Center - Stair Landing

**Extra work scopes:** EW-504

## How to run

1. Start your existing FastAPI backend. Create a separate Matter for each run.
2. From this case directory run `python upload_case.py` to upload all documents and process jobs.
3. For an as-of-time test, run `python upload_case.py --through YYYY-MM-DD` (for example `--through 2026-04-09`). This creates a separate Matter containing only documents available by the cutoff.
4. Only the files under `UPLOAD/` are test input; **never upload `expected_results.json`**.
5. Compare issues, evidence attribution, scope linking and actions to `expected_results.json` manually or with a custom adapter. The original eval harness does not automatically load these fixtures.

## Expected temporal checkpoints

- **As of 2026-04-09T17:00 → POTENTIAL_RISK**: Price expressly rejected and a separate on-site direction seeks continued work before agreement on amount.
- **As of 2026-04-13T23:59 → POTENTIAL_RISK**: Revised price is a new proposal, not proof that Owner accepted it.

## Critical mistakes to avoid
- Misread not approved as approved
- Assume owner rejection means no work was performed
- Treat a revised quote as an accepted amount

## Notes

- Upload order is chronological using `manifest.json` and names, not all files are intended to have been available on day one.
- `--through` creates a new Matter per run. To test true incremental updates to the *same* Matter, add documents to that Matter in chronological order using your UI or adapter.
- Do not treat synthetic expected labels as validated legal advice or as proof of recovery or forfeiture.
