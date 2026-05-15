# pi-crew Sprint 3 Report — Refactor & UI selectors (partial)

Date: 2026-05-14
Branch: `perf/sprint-3`
Status: 3/5 shipped, 1.6 + 1.7 deferred.

## Items shipped

| ID | Item | Commit |
|---|---|---|
| 5.1 | test:unit `--test-concurrency=4 --test-isolation=process` | fb72d45 |
| 2.8 | Extract adaptive-plan.ts (team-runner.ts 57 KB → 43 KB) | 72efeaa |
| 2.9 | Extract config types.ts (config.ts 38 KB → 34 KB) | 1093c6c |

## Items deferred

- **1.6 Dashboard pane independent rendering** — needs pane-level state
  isolation across run-dashboard.ts (24 KB) + 8 dashboard panes; will
  break overlapping renders if not done atomically. Defer to "UI
  selectors" follow-up that owns pane API surface.
- **1.7 Memoized snapshot slice with Object.is** — depends on 1.6 to be
  meaningful. Same defer.

## Bench

5.1 cuts unit-test wall time and lets later sprints iterate faster.
2.8 / 2.9 are pure refactors with no expected runtime delta.
Bench:check still green; numbers unchanged within noise band.

## Files

- `src/runtime/adaptive-plan.ts` (new, 338 lines)
- `src/runtime/team-runner.ts` (-1 import block, -260 lines body)
- `src/config/types.ts` (new, 199 lines)
- `src/config/config.ts` (-191 lines body, +60 re-exports)
- `package.json` (test:unit script)
