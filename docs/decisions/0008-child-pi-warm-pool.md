# 0008 Child-pi Warm Pool

Date: 2026-05-14

## Status

Proposed — not yet implemented.

## Context

Each task in a parallel team run spawns a fresh `pi` child process.
Cold-start of each child takes 2–5 s on Windows (most of that is Node
startup + module load). For a phase with 4 parallel tasks the spawn
cost serialises into the wall-clock floor.

## Decision (proposed)

Add an opt-in warm pool managed by `child-pi.ts`:

- Config: `runtime.warmPool.enabled: false` (default), `runtime.warmPool.size: 2`.
- Pool process is spawned with a `PI_CREW_POOL_HEALTH=1` ping handshake
  on startup; it parks in a `wait-for-prompt` state.
- On task dispatch, the parent writes the prompt + skill paths over
  stdin and reads stdout normally.
- Each pool process is single-use: after one task completes, the
  process exits and the pool refills in the background.
- A health check on reuse rejects any process that has unread stderr,
  is past `maxIdleMs`, or has an open file handle outside its
  scratch dir.

## Alternatives considered

1. Long-lived shared pool with state — unsafe (one task can pollute
   the next); rejected.
2. Pre-warm only when team-runner predicts a parallel batch — saves
   pool size but adds prediction logic; defer to later optimisation.
3. Status quo — retain the 2–5 s per task floor.

## Consequences

Positive:
- Wall-clock floor of parallel batches drops by 2–4 s per pool slot.
- Behaviour identical from the worker's perspective (single prompt
  per process).

Tradeoffs / risks:
- Pool processes are zombies until used. CPU cost is negligible but
  RAM cost is ~30–60 MB per slot.
- Crash-recovery semantics need an extra branch: `child-stdout-final`
  marker valid only after prompt was actually sent.
- Disabled by default for one release; enable globally once 50
  consecutive runs pass on the dogfood machine.

## Next steps

1. Implement pool inside `src/runtime/child-pi.ts`; expose
   `getPooledChild()` / `releasePooledChild()`.
2. Add health-check protocol over stdin/stdout JSON.
3. Stress test: 50 consecutive runs on a single pool, measure leak.
4. Default off; flip default after one stable release window.
5. Land ADR as "Accepted" after default-on rollout.
