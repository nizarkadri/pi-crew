# pi-crew Sprint 4 Report — Stability & telemetry (partial)

Date: 2026-05-14
Branch: `perf/sprint-4`
Status: 6/10 shipped, 1 skipped (already-addressed), 3 deferred to medium-risk follow-up.

## Items shipped

| ID | Item | Commit |
|---|---|---|
| 3.4 | atomic-write rename: jitter ±20%, cap 8 retries | d4cdfc1 |
| 3.6 | HeartbeatWatcher deadletter cooldown (default 60 s) | b5cb0ff |
| 3.2 | HeartbeatWatcher poll backoff: stale → 1 s, healthy → 5 s | 9bf1451 |
| 4.3 | Pre-tuned histogram buckets for run/task duration + tokens | 2db3584 |
| 4.2 | OTLP exporter gzips body (`content-encoding: gzip`) | 990281b |
| 3.7 | Idempotent resume — already preserved by path-keyed artifact map | (skip-with-note) |

## Items deferred (medium risk, need stress tests)

- **3.1 Backpressure on child-pi stdout** — needs a stress harness that
  forces sustained > 4 MB/s child output to verify watermark + pause/resume
  semantics; existing test infra mocks child pi.
- **3.5 Cancel propagate < 200 ms** — needs partial-stream parsing of
  `pi-json-output.ts` plus signal checks every N lines; requires either
  redesigning parsePiJsonOutput or a new stream-parse path.
- **3.3 Mailbox auto-archive at 10 MB** — needs new mailbox rotation
  format compatible with existing readers + blob-store integration.
- **3.8 Kill-tree fallback on Windows SIGKILL non-effect** — needs a
  test harness for stuck child processes (mocking pi.exe spawn). Risk of
  killing wrong PID tree if process died and PID was reused; needs
  /T flag + age check.

These 4 items keep their ADR-style write-up status from the original
plan and will land in their own branch.

## Bench

No expected delta (all changes are stability-oriented, not perf path).
Bench:check still green. Histogram-bucket change improves
Prometheus quantile accuracy (visible only via /team-metrics output).

## Files

- `src/state/atomic-write.ts` (3.4)
- `src/runtime/heartbeat-watcher.ts` (3.2 + 3.6)
- `src/observability/event-to-metric.ts` (4.3)
- `src/observability/exporters/otlp-exporter.ts` (4.2)
