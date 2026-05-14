# pi-crew Sprint 2.5 Report — deferred I/O items

Date: 2026-05-14
Branch: `perf/sprint-2.5`
Status: 1/3 shipped, 2 deferred to a later durability sprint.

## Items shipped

| ID | Item | Commit |
|---|---|---|
| 1.3 | Native FS watcher on `<crewRoot>/state` with poll fallback | ea39c40 |

The watcher feeds into renderScheduler.schedule({runId}) and reuses the
per-runId invalidate coalesce (1.9). On filesystems that don't support
recursive `fs.watch` it falls back to the existing 1 s preload tick.

Test added: `watchCrewState fires onRunChange when a run file is touched (1.3)`.

## Items deferred again

### 2.1 Atomic-write coalescer

Defining "coalesce 50 ms window on saveRunTasks/saveRunManifest" requires:

1. A buffered write path that hands `loadRunManifestById` and other readers
   a coherent in-memory view (otherwise reads after a buffered write race).
2. flushSync hooks in cleanupRuntime + session_before_switch + every
   process exit code path.
3. A crash-recovery integration test that proves no data loss when the
   process is killed mid-window.

This is a state-store redesign, not a tiny lane change. Punted to a
follow-up "durability/coalescer" sprint that owns it end-to-end.

### 2.2 events.jsonl buffer 20 ms

Same blocker: `appendEvent` runs under a cross-process file lock, computes
a monotonic `seq` from the on-disk file, and emits to `runEventBus`
synchronously. Buffering writes without redesigning the sequence cache and
lock protocol corrupts seq under concurrent appenders.

Punted with 2.1.

## Bench

No measurable bench delta (1.3 only fires on real FS events; bench harness
does not stress that path). Existing gates green.

## Files

- `src/utils/fs-watch.ts` (+createRecursiveWatcher, watchCrewState, runIdFromStateRelativePath)
- `src/extension/register.ts` (wire crewWatcher in session_start, dispose in cleanupRuntime)
- `test/unit/fs-watch.test.ts` (+2 new cases)
