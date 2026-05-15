# pi-crew Sprint 5 Report — High-risk + ADRs

Date: 2026-05-14
Branch: `perf/sprint-5`
Status: 1/5 shipped (5.2). 3 high-risk items have proposed ADRs ready
for prototyping in dedicated branches; not implemented in this batch.

## Items shipped

| ID | Item | Commit |
|---|---|---|
| 5.2 | `npm run test:watch` script | (this branch) |

## ADRs filed (Proposed)

| ADR | Item | Status |
|---|---|---|
| `docs/decisions/0006-publish-bundled-esm.md` | 5.5 Bundle ESM (esbuild) | Proposed |
| `docs/decisions/0007-active-run-binary-index.md` | 2.4 active-run-registry binary index | Proposed |
| `docs/decisions/0008-child-pi-warm-pool.md` | 2.6 child-pi warm pool | Proposed |

Each ADR captures context, alternatives, decision, consequences, and
next steps. None of the three are implemented in this sprint.

## Items deferred again

- **2.5 Lazy materialize crew-agent-records** — depends on 2.2 events
  buffer (already deferred from Sprint 2.5) for safe in-memory flush
  semantics.

## Why proposed-only?

The three high-risk items all share characteristics:

1. They change a contract that other parts of the codebase or external
   users depend on (extension entrypoint, registry on-disk format,
   child-process lifecycle).
2. They need OS-coverage smoke tests before defaulting on.
3. They each warrant their own dedicated branch + soak window so a
   regression in one doesn't block the other two.

Filing them as Proposed ADRs lets the next maintenance cycle pick any
one of them up cleanly. The ADRs include cost estimates and rollback
paths.

## Files

- `package.json` (test:watch)
- `docs/decisions/0006-publish-bundled-esm.md`
- `docs/decisions/0007-active-run-binary-index.md`
- `docs/decisions/0008-child-pi-warm-pool.md`
