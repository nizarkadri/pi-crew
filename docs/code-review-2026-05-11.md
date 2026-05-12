# Code Review Findings — pi-crew (2026-05-11)

Reviewer: Droid (Factory)
Scope: toàn bộ `pi-crew/` (src + schema + worktree + state + extension), read-only.
Phương pháp: đối chiếu code với `AGENTS.md` (project + workspace), kiểm tra security/concurrency/cleanup theo OWASP + best practices.

---

## Tóm tắt mức độ

| ID | Severity | Khu vực | Tiêu đề |
|---|---|---|---|
| BUG-001 | **High** | Schema / Tool dispatch | `action: "retry"` bị schema từ chối nhưng có handler |
| BUG-002 | **High** | Artifact integrity | `contentHash` không khớp với bytes đã ghi xuống đĩa |
| BUG-003 | Medium | AGENTS.md compliance | 12 vị trí `await import(...)` vi phạm rule "no dynamic inline imports" |
| BUG-004 | Medium | Concurrency | `withRunLockSync` và `withRunLock` xử lý stale-lock khác nhau |
| BUG-005 | Medium | Worktree lifecycle | `git worktree add -b <branch>` fail khi branch đã tồn tại từ run cũ |
| BUG-006 | Low/Med | Worktree | `linkNodeModulesIfPresent` không kiểm tra source là directory |
| BUG-007 | Low | Worktree setup hook | Hook lỗi/non-JSON bị nuốt hoàn toàn, không log |
| NIT-001 | Low | API hygiene | `__test__renameWithRetry` được gọi từ production path |
| NIT-002 | Low | Code style | Empty-string argv flag trong `git worktree remove` |
| NIT-003 | Low | Immutability | `executedConfig.runtime` bị mutate khi resume |
| NIT-004 | Low | Redaction | Cần verify transcript trên đĩa luôn được redact |

---

## BUG-001 — `action: "retry"` bị schema từ chối nhưng có handler

**Severity:** High
**Files:**
- `src/schema/team-tool-schema.ts:18-49` (TypeBox schema)
- `src/schema/team-tool-schema.ts:95` (TS interface)
- `src/extension/team-tool.ts:264` (dispatch)
- `src/extension/team-tool/cancel.ts` (`handleRetry`)

### Mô tả

TypeBox schema `TeamToolParams` định nghĩa `action` là một `Type.Union` của các `Type.Literal`. Danh sách literal **không có** `"retry"`:

```ts
// src/schema/team-tool-schema.ts:18-49
action: Type.Optional(Type.Union([
    Type.Literal("run"),
    Type.Literal("parallel"),
    Type.Literal("plan"),
    Type.Literal("status"),
    Type.Literal("list"),
    Type.Literal("get"),
    Type.Literal("cancel"),
    // ... KHÔNG có Type.Literal("retry") ở đây
    Type.Literal("resume"),
    Type.Literal("respond"),
    ...
])),
```

Nhưng TypeScript interface lại **có** `"retry"`:

```ts
// src/schema/team-tool-schema.ts:95
action?: "run" | "parallel" | "plan" | "status" | "list" | "get" | "cancel" | "retry" | "resume" | ...;
```

Và `handleTeamTool` dispatch nó:

```ts
// src/extension/team-tool.ts:264
case "retry": return handleRetry(params, ctx);
```

### Hậu quả

- Khi pi-coding-agent validate tool params bằng TypeBox schema (cách thông thường để gate input từ LLM), call `team {action: "retry"}` bị **reject ngay tại validation layer**, không bao giờ chạm tới `handleRetry`.
- TS interface vs TypeBox schema lệch nhau, code path `handleRetry` là **dead code** từ góc nhìn tool runtime.

### Cách reproduce

```bash
# Từ pi REPL hoặc qua tool API:
team(action="retry", runId="<id>")
# → schema validation error "must be equal to one of the allowed values"
```

### Fix đề xuất

Thêm literal vào union và đồng bộ test:

```ts
// src/schema/team-tool-schema.ts
action: Type.Optional(Type.Union([
    Type.Literal("run"),
    ...
    Type.Literal("cancel"),
    Type.Literal("retry"),   // ← thêm dòng này
    Type.Literal("resume"),
    ...
])),
```

Và thêm test trong `test/unit/team-tool-schema.test.ts`:

```ts
test("schema accepts action: retry", () => {
    const ok = Value.Check(TeamToolParams, { action: "retry", runId: "r1" });
    assert.strictEqual(ok, true);
});
```

---

## BUG-002 — `writeArtifact` ghi nội dung đã redact nhưng hash bytes gốc

**Severity:** High
**File:** `src/state/artifact-store.ts:106-129`

### Mô tả

```ts
// src/state/artifact-store.ts:117-121
// Compute hash on original content for integrity verification.
const contentHash = hashContent(options.content);
const content = redactSecretString(options.content);
atomicWriteFile(filePath, content);
const stats = fs.statSync(filePath);
return {
    kind: options.kind,
    path: filePath,
    ...
    sizeBytes: stats.size,       // ← size của bytes đã redact
    contentHash,                 // ← hash của bytes gốc, chưa redact
    ...
};
```

`contentHash` được compute trên `options.content` (chưa redact) trong khi file trên đĩa là `redactSecretString(options.content)`. `sizeBytes` được lấy từ `fs.statSync(filePath)` → là size của bytes đã redact.

### Hậu quả

- Bất kỳ consumer nào "verify integrity" bằng cách re-hash file path sẽ luôn nhận digest **khác** với `contentHash` mỗi khi nội dung gốc có chứa secret pattern.
- `sizeBytes` và `contentHash` không nhất quán với nhau (size là post-redaction, hash là pre-redaction).
- Comment "Compute hash on original content for integrity verification" nói **lý do** nhưng hợp đồng vẫn sai: integrity check là đối chiếu hash với file trên đĩa, không phải với memory.

### Hai phương án sửa

**Option A — Hash post-redaction (khuyến nghị):**
```ts
const content = redactSecretString(options.content);
atomicWriteFile(filePath, content);
const contentHash = hashContent(content);
const stats = fs.statSync(filePath);
```
Đảm bảo `contentHash === sha256(fs.readFileSync(filePath))`. Mất khả năng "trace back to pre-redaction source" — nhưng đó là behavior an toàn cho artifact-store.

**Option B — Lưu cả hai field nếu cần:**
```ts
return {
    ...,
    contentHash,                  // pre-redaction (source-of-truth)
    storedContentHash: hashContent(content),  // post-redaction (đúng với file)
    sizeBytes: stats.size,
};
```
Sau đó update `ArtifactDescriptor` trong `src/state/types.ts:8-16` và mọi consumer.

### Cần thêm test

```ts
test("writeArtifact: contentHash matches bytes on disk", () => {
    const desc = writeArtifact(root, {
        kind: "log", relativePath: "x.log",
        content: "api_key=AKIA0123456789ABCDEF",
        producer: "test",
    });
    const onDisk = fs.readFileSync(desc.path);
    assert.strictEqual(desc.contentHash, sha256(onDisk));
    assert.strictEqual(desc.sizeBytes, onDisk.length);
});
```

---

## BUG-003 — 12 vị trí `await import(...)` vi phạm rule "Avoid dynamic inline imports"

**Severity:** Medium (rule violation, không phải runtime bug)
**Rule nguồn:** `pi-crew/AGENTS.md` — "Avoid dynamic inline imports."

### Danh sách vi phạm

| File | Line | Module được import lazy |
|---|---|---|
| `src/extension/team-tool.ts` | 35 | `../runtime/team-runner.ts` |
| `src/extension/team-tool/run.ts` | 18 | `../../runtime/team-runner.ts` |
| `src/extension/team-manager-command.ts` | 8 | `./team-tool.ts` |
| `src/extension/cross-extension-rpc.ts` | 8 | `./team-tool.ts` |
| `src/extension/registration/team-tool.ts` | 17 | `../team-tool.ts` |
| `src/extension/registration/subagent-tools.ts` | 9 | `../team-tool.ts` |
| `src/runtime/task-runner.ts` | 294 | `./task-runner/live-executor.ts` |
| `src/runtime/runtime-resolver.ts` | 40 | `@mariozechner/pi-coding-agent` |
| `src/runtime/live-session-runtime.ts` | 311 | `@mariozechner/pi-coding-agent` |
| `src/runtime/background-runner.ts` | 13 | `./team-runner.ts` |
| `src/runtime/yield-handler.ts` | 9 | `ajv` |
| `src/ui/run-action-dispatcher.ts` | 8 | `../extension/team-tool.ts` |

### Phân tích

Một số có comment giải thích lý do (extension/team-tool.ts:33-34):
> Heavy runtime — lazy-loaded to avoid 1.4s import cost at extension registration. executeTeamRun is only called when a team run actually executes.

Đây là tối ưu hợp lệ. Nhưng AGENTS.md đang nói absolute "avoid", không có exception. Hai cách giải quyết:

**Option A — Update AGENTS.md để hợp pháp hoá lazy boundary:**
```md
- Avoid dynamic inline imports, EXCEPT at documented lazy-load boundaries
  to defer heavy runtime cost (mark with `// LAZY: <reason>`).
```

**Option B — Refactor về top-level imports:**
- Move heavy modules vào separate package hoặc dùng `import type` cho type-only, runtime import vào top.
- Có thể vẫn giữ lazy cho `runtime-resolver.ts:40` (`@mariozechner/pi-coding-agent`) vì là peer dependency optional.

### Recommendation

Chọn **Option A**, thêm comment marker `// LAZY: <reason>` cho mỗi site và thêm grep-check trong CI để chặn dynamic import không marker.

---

## BUG-004 — `withRunLockSync` và `withRunLock` xử lý stale-lock khác nhau

**Severity:** Medium
**File:** `src/state/locks.ts:50-91`

### Mô tả

**Sync path** (`acquireLockWithRetry` → `readLockState`):
```ts
// locks.ts:43-50
function readLockState(filePath: string, staleMs: number): boolean {
    if (!isLockStale(filePath, staleMs)) return false;
    try {
        fs.rmSync(filePath, { force: true });
        return true;     // ← chỉ true khi rmSync thành công
    } catch {
        return false;    // ← throw sẽ xảy ra ở caller
    }
}

// locks.ts:71-83
function acquireLockWithRetry(filePath, staleMs) {
    ...
    if (!readLockState(filePath, staleMs)) {
        throw new Error(`Run '...' is locked by another operation.`);
    }
    ...
}
```

**Async path** (`acquireLockWithRetryAsync` → `readLockStateAsync`):
```ts
// locks.ts:96-103
function readLockStateAsync(filePath: string, staleMs: number): void {
    try {
        if (isLockStale(filePath, staleMs)) fs.rmSync(filePath, { force: true });
    } catch {
        // Ignore stale-check races.
    }
}

// locks.ts:105-117
async function acquireLockWithRetryAsync(...) {
    ...
    if (Date.now() > deadline) {
        throw new Error(`Run '...' is locked by another operation.`);
    }
    readLockStateAsync(filePath, staleMs);    // ← không check return
    await sleep(delay);
    attempt++;
    // ← luôn loop lại
}
```

### Hậu quả

- Sync version: nếu `rmSync` fail (file đang lock bởi process khác trên Windows), throw **ngay lập tức** lần đầu tiên thấy stale lock, không retry.
- Async version: luôn retry tới `deadline`.

Inconsistent behavior → cùng một stale-lock + transient `rmSync` race có thể fail trong sync code path nhưng pass trong async path.

### Fix đề xuất

Đồng bộ behavior: sync version cũng nên retry tới deadline:

```ts
function acquireLockWithRetry(filePath: string, staleMs: number): void {
    let attempt = 0;
    const deadline = Date.now() + staleMs * 2;
    while (true) {
        try {
            writeLockFile(filePath);
            return;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "EEXIST") throw error;
            if (Date.now() > deadline) {
                throw new Error(`Run '${path.basename(filePath)}' is locked by another operation.`);
            }
            // Try to clear stale, but don't bail on rmSync error — let loop retry
            try {
                if (isLockStale(filePath, staleMs)) fs.rmSync(filePath, { force: true });
            } catch { /* race — let loop retry */ }
            sleepSync(Math.min(250, 25 * 2 ** attempt));
            attempt++;
        }
    }
}
```

### Test cần thêm

Mở rộng `test/unit/locks-race.test.ts` với case: stale lock + `rmSync` race (mock fs.rmSync để throw lần đầu, pass lần thứ hai) → assert lock được acquire sau retry.

---

## BUG-005 — `git worktree add -b <branch>` fail khi branch đã tồn tại từ run cũ

**Severity:** Medium
**File:** `src/worktree/worktree-manager.ts:100-114`

### Mô tả

```ts
// worktree-manager.ts:100-114
if (fs.existsSync(worktreePath)) {
    // ... reuse path: verify branch matches
    return { cwd: worktreePath, worktreePath, branch, reused: true };
}
git(repoRoot, ["worktree", "add", "-b", branch, worktreePath, "HEAD"]);
```

Điều kiện reuse chỉ check `worktreePath` directory. Nhưng branch `pi-crew/<runId>/<taskId>` có thể tồn tại trong git mà worktree directory đã bị xoá thủ công (hoặc `cleanupRunWorktrees` xoá directory nhưng git worktree metadata còn).

### Hậu quả

- Sau crash hoặc cleanup không hoàn chỉnh, retry/resume run sẽ fail với git error: `fatal: a branch named 'pi-crew/.../...' already exists`.
- User bị stuck, phải manual `git branch -D`.

### Fix đề xuất

Thêm branch existence check trước `add`:

```ts
function branchExists(repoRoot: string, branch: string): boolean {
    try {
        git(repoRoot, ["rev-parse", "--verify", `refs/heads/${branch}`]);
        return true;
    } catch {
        return false;
    }
}

function pruneStaleWorktrees(repoRoot: string): void {
    try { execFileSync("git", ["worktree", "prune"], { cwd: repoRoot, stdio: "ignore" }); }
    catch { /* best-effort */ }
}

// In prepareTaskWorkspace, before `git worktree add`:
pruneStaleWorktrees(repoRoot);
if (branchExists(repoRoot, branch)) {
    // Option 1: reuse from existing branch
    git(repoRoot, ["worktree", "add", worktreePath, branch]);
} else {
    git(repoRoot, ["worktree", "add", "-b", branch, worktreePath, "HEAD"]);
}
```

### Test cần thêm

`test/unit/worktree-manager.test.ts` (chưa tồn tại):
1. Create worktree, manual delete directory (`rm -rf` không qua git), branch still exists.
2. Call `prepareTaskWorkspace` again → expect success, not fatal.

---

## BUG-006 — `linkNodeModulesIfPresent` không kiểm tra source là directory

**Severity:** Low/Medium
**File:** `src/worktree/worktree-manager.ts:43-53`

### Mô tả

```ts
function linkNodeModulesIfPresent(repoRoot: string, worktreePath: string): boolean {
    const source = path.join(repoRoot, "node_modules");
    const target = path.join(worktreePath, "node_modules");
    if (!fs.existsSync(source) || fs.existsSync(target)) return false;
    try {
        fs.symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
        return true;
    } catch {
        return false;
    }
}
```

- Nếu `repoRoot/node_modules` là **file** (hiếm nhưng có thể xảy ra với corrupt setup), `existsSync` vẫn true, symlink được tạo với type `"dir"/"junction"` → behavior không xác định, đặc biệt là junction trên Windows yêu cầu directory.
- Nếu source là **symlink to dir**, có thể link chain → khó debug.

### Fix đề xuất

```ts
function linkNodeModulesIfPresent(repoRoot: string, worktreePath: string): boolean {
    const source = path.join(repoRoot, "node_modules");
    const target = path.join(worktreePath, "node_modules");
    let sourceStat: fs.Stats;
    try { sourceStat = fs.statSync(source); } catch { return false; }
    if (!sourceStat.isDirectory()) return false;
    if (fs.existsSync(target)) return false;
    try {
        fs.symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
        return true;
    } catch {
        return false;
    }
}
```

Dùng `statSync` (theo symlink) thay vì `existsSync` để cũng bắt case "source là dangling symlink".

---

## BUG-007 — Setup hook lỗi/non-JSON bị nuốt hoàn toàn, không log

**Severity:** Low
**File:** `src/worktree/worktree-manager.ts:75-89`

### Mô tả

```ts
try {
    const lines = trimmed.split(/\r?\n/);
    const lastLine = lines[lines.length - 1] ?? trimmed;
    const parsed = JSON.parse(lastLine) as { syntheticPaths?: unknown };
    if (!Array.isArray(parsed.syntheticPaths)) return [];
    return [...new Set(parsed.syntheticPaths.filter(...).map(...))];
} catch {
    // Hook output was not valid JSON — treat as no synthetic paths
    return [];
}
```

Hook trả về JSON parse error → return `[]` silently. User không biết hook đang chạy không đúng cho tới khi worktree thiếu paths.

### Fix đề xuất

```ts
} catch (error) {
    logInternalError("worktree.setupHook.parse", error,
        `lastLine=${(trimmed.split(/\r?\n/).pop() ?? "").slice(0, 200)}`);
    return [];
}
```

Hoặc nếu hook output không trống nhưng JSON parse fail → emit event vào event log của run.

---

## NIT-001 — `__test__renameWithRetry` được gọi từ production path

**File:** `src/state/atomic-write.ts:55-67, 99`

```ts
export function __test__renameWithRetry(tempPath, filePath, retries = 10, rename = fs.renameSync) {
    ...
}

// Production usage:
export function atomicWriteFile(filePath: string, content: string): void {
    ...
    __test__renameWithRetry(tempPath, filePath);    // ← production
}
```

Convention: tên `__test__` ngụ ý "chỉ dùng cho test, không stable". Production sử dụng nó là smell. Đổi tên thành `renameWithRetry` (public utility) và re-export bản test với alias.

---

## NIT-002 — Empty-string argv flag trong `git worktree remove`

**File:** `src/worktree/cleanup.ts:64`

```ts
git(manifest.cwd, ["worktree", "remove", options.force ? "--force" : "", worktreePath].filter(Boolean));
```

Pattern `cond ? "--force" : ""` rồi `.filter(Boolean)` hoạt động nhưng dễ gãy. Tốt hơn:

```ts
const args = ["worktree", "remove"];
if (options.force) args.push("--force");
args.push(worktreePath);
git(manifest.cwd, args);
```

---

## NIT-003 — `executedConfig.runtime` bị mutate khi resume

**File:** `src/extension/team-tool.ts:184-190`

```ts
const executedConfig = effectiveRunConfig(loadedConfig.config, params.config);
if (!executedConfig.runtime?.mode && resumeManifest.runtimeResolution?.safety === "explicit_dry_run") {
    const workersDisabled = executedConfig.executeWorkers === false || ...;
    if (!workersDisabled) executedConfig.runtime = { ...executedConfig.runtime, mode: "scaffold" };
}
```

Code có thể đang assume `effectiveRunConfig` trả về object mới. Cần verify và document immutability, hoặc thay bằng explicit clone:

```ts
const executedConfig: PiTeamsConfig = {
    ...effectiveRunConfig(loadedConfig.config, params.config),
};
```

---

## NIT-004 — Verify transcript trên đĩa luôn được redact

**File:** `src/runtime/child-pi.ts:148-152`, đối chiếu với `recoverCheckpointedTasks` (`src/extension/team-tool.ts:155-156`)

```ts
// child-pi.ts:148-152
function appendTranscript(input: ChildPiRunInput, line: string): void {
    if (!input.transcriptPath) return;
    fs.mkdirSync(path.dirname(input.transcriptPath), { recursive: true });
    fs.appendFileSync(input.transcriptPath, `${redactJsonLine(line)}\n`, "utf-8");
}
```

Transcript được redact qua `redactJsonLine` — good. Nhưng trong recovery path:

```ts
// team-tool.ts:155-156
const transcript = fs.readFileSync(transcriptPath, "utf-8");
const parsed = parsePiJsonOutput(transcript);
...
const resultArtifact = writeArtifact(manifest.artifactsRoot, {
    kind: "result", ..., content: parsed.finalText ?? "..."
});
```

Vì `writeArtifact` lại redact thêm lần nữa (đã verify ở BUG-002), double-redaction là idempotent (`***` không match secret pattern). OK.

**Action:** thêm test `test/unit/redaction-transcript-roundtrip.test.ts`:
1. Spawn mock child producing JSON line với secret.
2. Read transcript file → assert không có secret raw.
3. Run `recoverCheckpointedTasks` → assert result artifact cũng không có secret.

---

## Gaps về test coverage

| Module | Trạng thái |
|---|---|
| `src/worktree/worktree-manager.ts` | Chỉ có `branch-freshness.test.ts`. Thiếu test cho `prepareTaskWorkspace` (reuse path, branch mismatch, setupHook). |
| `src/worktree/cleanup.ts` | Có `lifecycle-actions.test.ts` indirect. Thiếu test trực tiếp cho dirty-preserve + diff artifact. |
| `src/state/locks.ts` (sync vs async parity) | `locks-race.test.ts` + `api-locks.test.ts` không assert sự khác biệt nêu ở BUG-004. |
| `src/state/artifact-store.ts` | Cần test hash/size match (BUG-002). |
| `src/schema/team-tool-schema.ts` | `team-tool-schema.test.ts` không có case cho `retry` (BUG-001). |

---

## Điểm tích cực

- **Path-traversal guards** trong `resolveInside` (`artifact-store.ts:96-105`) combine cả relative-segment check, `path.relative` check và `path.normalize + startsWith(base + sep)`.
- **Atomic write** dùng `O_EXCL | O_NOFOLLOW`, post-open `fstatSync().isFile()` verification, Windows EPERM/EBUSY rename retry.
- **Process management** trong `child-pi.ts` track PID trong `activeChildProcesses`, hỗ trợ `taskkill /T /F` (Win) + `process.kill(-pid, ...)` (POSIX), có hard-kill fallback và post-exit stdio guard.
- **Env-secret filtering** trước khi spawn child Pi (`child-pi.ts:113`) dùng `SECRET_KEY_PATTERN` để loại token/api_key/password khỏi env.
- **Default-safe execution**: `executeWorkers=false` / `PI_CREW_EXECUTE_WORKERS=0` / `PI_TEAMS_EXECUTE_WORKERS=0` block worker; `runtime.mode=scaffold` cho dry-run.
- **Index.ts minimal**: đúng rule, chỉ 5 dòng.
- **Lockstep destructive gates**: `delete` requires `confirm:true`, referenced resources block trừ khi `force:true` (verified ở `management.ts:344-353`).

---

## Đề xuất ưu tiên fix

1. **BUG-001** (5 phút): thêm 1 dòng `Type.Literal("retry")` + 1 test.
2. **BUG-002** (15 phút): chọn Option A, đổi thứ tự hash/write + thêm test integrity.
3. **BUG-004** (30 phút): đồng bộ sync/async lock retry behavior + test.
4. **BUG-005** (1 giờ): thêm branch existence check + worktree prune trước add, viết test.
5. **BUG-003** (1 giờ): update AGENTS.md với rule exception cho lazy boundaries, thêm marker comments.
6. Phần còn lại: batch trong release sau.
