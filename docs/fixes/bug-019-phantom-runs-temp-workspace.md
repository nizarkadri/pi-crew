# Bug #19: Phantom Runs from Temp Workspaces

## Problem
Runs in `/tmp/pi-crew-*/` directories were appearing in production dashboard as "running" even after processes died. This caused confusion and UI clutter with "9 running" when there was actually only 1.

## Root Cause
1. Test suite (npm test) creates runs in `/tmp/` with live-session or scaffold runtime
2. These runs don't have `async.pid` (child-process runs have it, live-session/scaffold don't)
3. When tests complete/crash, entries remain in `active-run-index.json`
4. `collectRuns()` scans temp dirs and shows stale manifests
5. `activeRunEntries()` was not checking timestamp for non-async runs

## Fix

### 1. `src/extension/run-index.ts` - collectRuns() 
Added detection for temp directories and PID alive check:
```typescript
const tempDirs = [os.tmpdir(), "/var/tmp", "/tmp"];
const isTempRoot = tempDirs.some((t) => root.startsWith(t + path.sep));

// For runs in temp dirs, verify background process is alive
if (isTempRoot && (manifest.status === "running" || ...)) {
    const asyncPidPath = path.join(path.dirname(manifest.stateRoot), "async.pid");
    // ... check PID alive
}
```

### 2. `src/state/active-run-registry.ts` - filterAliveEntries() + activeRunEntries()
Added 30-minute timeout for non-async runs:
```typescript
// 2.19 — Stale non-async run: live-session/scaffold runs older than 30 min
if (!raw.async) {
    const updatedAt = typeof raw.updatedAt === 'string' ? Date.parse(raw.updatedAt) : NaN;
    if (Number.isFinite(updatedAt) && Date.now() - updatedAt > 30 * 60 * 1000) return false;
}
```

## Files Changed
- `src/extension/run-index.ts`: Added `os` import and temp root check in collectRuns()
- `src/state/active-run-registry.ts`: Added 30-min timeout for non-async runs in both filterAliveEntries() and activeRunEntries()

## Verification
After fix:
- Active-run-index is cleared of stale entries
- Runs older than 30 min with no async.pid are filtered out
- Only valid runs with alive PIDs or recent timestamps are shown

## Why Two Places?
- `run-index.ts` - handles scanning runs from disk (collectRuns)
- `active-run-registry.ts` - handles the in-memory registry of active runs

Both needed the fix because the dashboard uses both sources.