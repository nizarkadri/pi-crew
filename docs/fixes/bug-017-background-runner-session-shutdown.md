# Bug #17: Background Runner Dies at ~35s — Root Cause

## Summary

Background runners (async mode) were dying ~35 seconds after spawn — before workers could complete. This was NOT caused by Pi's `killTrackedDetachedChildren` mechanism or any external kill signal.

## Root Cause

**`session_shutdown` fires frequently during normal operation**, not just on exit.

Pi's agent-session fires `session_shutdown` for:
- `session_fork` — when a subagent/fork session starts
- `session_resume` — when resuming a previous session
- `session_new` — when creating a new session

Every time `session_shutdown` fires, pi-crew's `cleanupRuntime()` was called:

```typescript
// register.ts - OLD CODE (BUG #17)
pi.on("session_shutdown", () => cleanupRuntime());

// Inside cleanupRuntime():
for (const manifest of manifestCache.list(50)) {
    if (manifest.async?.pid !== undefined && checkProcessLiveness(manifest.async.pid).alive) {
        killProcessPid(manifest.async.pid);  // ← THIS KILLED THE RUNNER
    }
}
```

Since `session_shutdown` fires every 30-35 seconds during normal operation (whenever the agent session forks/resumes), this kill loop terminated the background runner almost immediately.

## Why setsid+detached didn't fully help

`detached: true` + `setsid: true` gives the runner its own session and process group, making it immune to terminal signals and process group kills. However, `killProcessPid(pid)` sends `SIGKILL` directly to the specific PID — and since the kill loop was actively reading the manifest cache, it knew the exact runner PID to kill.

## The Fix

Comment out the async runner kill loop in `cleanupRuntime()`:

```typescript
// register.ts - FIXED CODE
// NOTE: Background runners are designed to outlive the Pi session.
// Do NOT kill them on session_shutdown — they manage their own lifecycle.
// (The kill loop was commented out here)
```

Async runners are designed to outlive the parent Pi session. They self-terminate when:
- The run completes (async.completed event written)
- The run fails (async.failed event written)  
- The stale reconciler detects they're truly dead
- They detect their parent (Pi) is gone via parent-guard

## Files Changed

- `src/extension/register.ts` — commented out killAsync loop in cleanupRuntime

## Verification

After the fix, a background runner (PID 55515) with systemd-run survived 160+ seconds and completed its lifecycle normally (timed out at 5 min due to unresponsive model — different issue).

## Related Investigation

- `systemd-run --user` was tested as an alternative spawn method — it works and provides additional isolation
- `setsid: true` is confirmed working in Node.js 22.22.0 (creates own session/PGID)
- The strace diagnostic was crucial: showed PID 20654 (Pi bash child) calling `kill(-20533, SIGTERM/SIGKILL)` on all old runner PIDs — this was Pi's cleanup hitting the strace wrapper's PID, not the runner itself
- Final spawn uses `spawn()` with `detached: true`, `setsid: true as any`, stdio ignored, unref'd — clean and minimal