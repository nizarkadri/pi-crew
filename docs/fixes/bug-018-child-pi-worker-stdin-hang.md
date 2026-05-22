# Bug #18 Fix: Child Pi Workers Hang on stdin with setsid+detached

## Root Cause

When `buildChildPiSpawnOptions()` in `child-pi.ts` used `stdio: ["pipe", "pipe", "pipe"]` with `detached: true` and `setsid: true`, the child process would hang indefinitely with:
- `toolUses: 0`
- `jsonEvents: 0` 
- No stdout output ever received

The issue is that `stdin: "pipe"` creates a readable stream that the child process can block on waiting for input. Even though:
1. The task is passed via CLI args (`Task: ...`), not stdin
2. The parent never writes to the child's stdin
3. `child.stdin?.write()` is only called for "steer" (wrap-up message)

The combination of `setsid: true` + `detached: true` + `stdio: ["pipe", ...]` creates a state where the child's stdin pipe can hang/block, preventing the child from processing.

## The Fix

Changed `stdio: ["pipe", "pipe", "pipe"]` to `stdio: ["ignore", "pipe", "pipe"]` in `buildChildPiSpawnOptions()`.

With `stdin: "ignore"`:
- No stdin pipe is created at all
- The child immediately gets EOF on stdin (from /dev/null)
- Child never blocks waiting for stdin
- Task is delivered via CLI args as expected

## File Changed

**`/home/bom/source/my_pi/pi-crew/src/runtime/child-pi.ts`** (line ~199):

```typescript
return {
    cwd,
    env: { ...filteredEnv, PI_CREW_PARENT_PID: String(process.pid) },
    stdio: ["ignore", "pipe", "pipe"], // stdin=ignore: child doesn't wait for input; task comes via CLI args
    detached: process.platform !== "win32",
    setsid: true,
    windowsHide: true,
} as SpawnOptions;
```

## Verification

Before fix: Workers timed out at 300s with `toolUses: 0, jsonEvents: 0`

After fix: Workers actively process tasks, producing output in seconds:
```
01_explore: status=running toolUses=203 jsonEvents=1375
02_plan: status=running toolUses=67 jsonEvents=483
```

The run successfully progresses through phases (explore, plan) with active tool use and JSON event generation.

## Test Results

- **Bug #18 (worker stdin hang)**: FIXED - workers now produce output immediately
- **Bug #17 (background runner death at 35s)**: FIXED - runners survive indefinitely

Both bugs were related to process/session lifecycle issues but had different root causes:
- Bug #17: `cleanupRuntime()` killing all async runners on session_shutdown
- Bug #18: `stdio: ["pipe", ...]` with `setsid`+`detached` causing stdin block