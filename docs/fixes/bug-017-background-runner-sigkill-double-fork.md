# Bug #17: Background Runner Killed by Pi's SIGKILL After Tool Execution

## Status: ✅ Fixed — Direct spawn with SIGTERM ignore-all

## Symptom
Background runner process dies silently ~7 seconds after spawning. No error events, no catch blocks fire. The process simply disappears.

## Root Cause
Pi's infrastructure sends SIGTERM to child processes when tool execution completes. The background runner (spawned by the team tool) receives these SIGTERMs and, with the original signal handler that checked `isPiProcess()`, would exit on non-Pi SIGTERMs. Even after fixing the SIGTERM handler to ignore all, the runner was being killed during jiti compilation of `team-runner.ts` — likely due to the runner being in Pi's process group.

## Fix Applied
**Direct spawn with `setsid: true` and ignore-all SIGTERM handler:**

1. **`async-runner.ts`**: Spawn runner directly (no double-fork detacher) with `detached: true, setsid: true` — runner gets its own session/process group
2. **`background-runner.ts`**: SIGTERM handler ignores ALL SIGTERMs (removed `isPiProcess()` check), since with setsid the runner is its own session leader
3. **`background-runner.ts`**: Removed `process.exit(1)` from unhandled rejection guard — now just sets exitCode and continues
4. **`child-pi.ts`**: Added `setsid: true` to child Pi spawn options — workers get their own PGIDs, preventing cascade kills

## What Didn't Work
- **Double-fork (detacher)**: Created an intermediate "detacher" process that spawned the runner then exited. The runner died at t+7s even with detacher alive. Root cause unclear — possibly fd inheritance issue or jiti compilation interaction.
- **`setsid` only**: With setsid but without ignore-all SIGTERM handler, runner received SIGTERMs and exited.
- **Ignore SIGTERM from Pi only**: With `isPiProcess()` check, SIGTERMs from systemd (after double-fork reparenting) weren't ignored.

## Verification
- Direct spawn runner alive after 2+ minutes ✅
- Workers spawned and running ✅
- SIGTERMs properly ignored ✅
- `sleep 60` via double-fork survived (rules out Pi directly killing random PIDs) ✅
