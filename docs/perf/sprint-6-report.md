# pi-crew Sprint 6 Report — Cleanup of deferred items

Date: 2026-05-14
Branch: `perf/sprint-6-cleanup`
Status: 7/12 shipped, 5 closed with technical rationale.

## Items shipped

| ID | Item | Commit |
|---|---|---|
| 3.8 | Verify taskkill on Windows + retry once if stuck | 928f203 |
| 3.5 | Fast-escalate to SIGKILL within 200 ms on explicit cancel | aeadb4a |
| 3.3 | Mailbox auto-archive at 10 MB | 7b16df5 |
| 3.1 | Soft backpressure watermark on child stdout (256 KB / 50 ms) | 287e053 |
| 1.6 + 1.7 | Per-slice signatures on RunUiSnapshot | d2d76cb |
| 5.5 | esbuild bundle dual-ship (`scripts/build-bundle.mjs`) | 2ef4012 |
| 2.4 | active-run-registry binary mirror via `node:v8` | df0f751 |

## Items closed with rationale (not implemented)

The 5 below remained deferred even after Sprint 6's broader scope.
Each has a clear technical blocker that warrants its own dedicated
branch + soak window, not a tactical commit.

### 2.1 atomic-write coalescer (saveRunTasks)

Coalescing buffered writes requires both:
- A read path (`loadRunManifestById`, `readEvents`, etc.) that consults
  the buffer before the file, otherwise readers get stale state.
- Cross-process correctness — another process appending events at the
  same time must observe the buffered tasks.json content.

Without redesigning state-store readers and the cross-process lock
protocol, dropping a coalescer in is a correctness regression. Punted
to a dedicated "durability sprint."

### 2.2 events.jsonl buffer 20 ms

Same blocker as 2.1, plus a stricter one: `appendEvent` runs under
`withEventLogLockSync` and computes a monotonic `seq` from the on-disk
file size. Buffering writes without redesigning the sequence cache and
lock protocol corrupts seq under concurrent appenders. Punted with 2.1.

### 2.5 lazy materialize crew-agent-records

Depends on 2.2 because the same buffered-write semantics are needed
for `agents/{taskId}/status.json` durability. Punted with 2.2.

### 2.6 child-pi warm pool

ADR 0008 captures the design. Implementation requires a soak harness
that runs ≥ 50 consecutive parallel team runs to confirm pool
processes don't leak state or hang on stdin handshake. Without that
infrastructure, shipping warm-pool default-on is unsafe.

### 1.6 / 1.7 partial — pane render migration

The framework for per-slice signatures is shipped; migrating each
dashboard pane to consume `snapshot.sliceSignatures.<slice>` via
Object.is short-circuit is a pane-by-pane refactor that touches 8
panes + the overlay system. That's its own UI-selectors branch.

## Cumulative bench delta (Sprint 0 → Sprint 6 final)

| Metric | Sprint 0 baseline | Final | Delta |
|---|---|---|---|
| register-startup.import.p95 | 655.39 ms | 536.57 ms | **−18.1 %** |
| register-startup.register.p95 | 27.51 ms | 25.77 ms | **−6.3 %** |
| render-flush.p95 | 0.36 ms | ~0.27 ms | **−25 %** |
| snapshot-cache.cold.p95 | 3.06 ms | ~2.60 ms | **−15 %** |
| snapshot-cache.warm.p95 | 3.06 ms | ~2.55 ms | **−16.7 %** |

(With the bundled ESM in `dist/index.mjs` enabled — i.e. flipping
`pi.extensions[]` to `./dist/index.mjs` after smoke tests — projected
`register-startup.import.p95` is ≤ 250 ms, per ADR 0006.)

## Tests

41/42 pass across 4 directly-touched suites under concurrency=4
(1 pre-existing skip). typecheck + check:lazy-imports + bench:check
all green.

## Files

- `src/runtime/child-pi.ts` (3.8 + 3.5 + 3.1)
- `src/state/mailbox.ts` (3.3)
- `src/state/active-run-registry.ts` (2.4)
- `src/ui/snapshot-types.ts` (1.6 + 1.7 framework)
- `src/ui/run-snapshot-cache.ts` (1.6 + 1.7)
- `scripts/build-bundle.mjs` (5.5, new)
- `package.json` (build:bundle script + esbuild dep)
- `package-lock.json` (esbuild)
- `.gitignore` (ignore dist/)
- `docs/perf/sprint-6-report.md` (this file)
