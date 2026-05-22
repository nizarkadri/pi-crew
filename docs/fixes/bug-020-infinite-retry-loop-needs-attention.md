# Bug #20: Infinite Retry Loop - Mock Tasks Never Complete

## Symptom
When running tests with `PI_TEAMS_MOCK_CHILD_PI=json-success`, tasks were stuck in an infinite loop:
- Task 01_explore ran repeatedly (100+ times)
- Each run completed quickly but the task status stayed "needs_attention"
- The DAG scheduler kept re-scheduling the same task

## Root Cause
The DAG-based task scheduler in `team-runner.ts` uses `completedIds` to determine which tasks are "done" and can unblock downstream tasks. However, it only considered `status === "completed"` as terminal.

When a task has `yield.enabled` but the worker doesn't call `submit_result`, the task returns `status === "needs_attention"` instead of "completed". This is a terminal state (treated as such in other places), but the DAG scheduler didn't recognize it as complete.

As a result:
1. Task 01_explore returns "needs_attention"
2. The DAG still thinks 01_explore is NOT completed
3. The DAG returns all tasks (including 01_explore) as "ready"
4. 01_explore gets re-scheduled, creating an infinite loop

## Fix
In `src/runtime/team-runner.ts`, change `completedIds` computation to also treat "needs_attention" as a completed state:

```typescript
// Before
const completedIds = new Set(tasks.filter((t) => t.status === "completed").map((t) => t.id));

// After
const completedIds = new Set(tasks.filter((t) => t.status === "completed" || t.status === "needs_attention").map((t) => t.id));
```

This fix was applied in three places in team-runner.ts:
- Line 411: DAG completion check
- Line 422: taskResults for workflow context
- Line 574: taskResults for phase advancement

## Why This Works
- "needs_attention" is already in the `terminalStatuses` set (used for workflow phase advancement)
- The task graph scheduler already treats "needs_attention" as a terminal state
- The only missing piece was the DAG-based dependency check

## Verification
Run a test with the mock:
```bash
PI_TEAMS_MOCK_CHILD_PI=json-success PI_TEAMS_EXECUTE_WORKERS=1 node --test test/unit/agent-runtime-files.test.ts
```

Expected: Test completes in ~3 seconds with 1 pass, 0 failures, 0 skipped.