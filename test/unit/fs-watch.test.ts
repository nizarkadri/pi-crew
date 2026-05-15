import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { closeWatcher, runIdFromStateRelativePath, watchCrewState, watchWithErrorHandler } from "../../src/utils/fs-watch.ts";


test("closeWatcher handles null input", () => {
	assert.doesNotThrow(() => {
		closeWatcher(null);
	});
});

test("watchWithErrorHandler invokes fallback when fs.watch throws", () => {
	let onErrorCalled = false;
	const nonExistent = `/tmp/pi-crew-watch-missing-${Date.now()}`;
	const watcher = watchWithErrorHandler(nonExistent, () => {}, () => {
		onErrorCalled = true;
	});
	assert.equal(watcher, null);
	assert.equal(onErrorCalled, true);
});

test("runIdFromStateRelativePath extracts runId from runs/{id}/...", () => {
	assert.equal(runIdFromStateRelativePath("runs/team_abc/manifest.json"), "team_abc");
	assert.equal(runIdFromStateRelativePath("runs/team_abc/agents/01/output.log"), "team_abc");
	assert.equal(runIdFromStateRelativePath("runs/team_abc"), "team_abc");
	assert.equal(runIdFromStateRelativePath("metrics/2026-05-14.jsonl"), undefined);
	assert.equal(runIdFromStateRelativePath(""), undefined);
});

test("watchCrewState fires onRunChange when a run file is touched (1.3)", async () => {
	const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-watch-state-"));
	const runId = "team_test_1";
	fs.mkdirSync(path.join(stateDir, "runs", runId), { recursive: true });
	const seen = new Set<string>();
	const watcher = watchCrewState(stateDir, (id) => seen.add(id), () => {});
	if (!watcher) {
		// fs.watch recursive not supported on this platform — skip the assertion.
		fs.rmSync(stateDir, { recursive: true, force: true });
		return;
	}
	try {
		await new Promise((resolve) => setTimeout(resolve, 50));
		fs.writeFileSync(path.join(stateDir, "runs", runId, "manifest.json"), "{}", "utf-8");
		// Wait briefly for FS event propagation — Windows can take 200-500ms.
		const deadline = Date.now() + 2000;
		while (!seen.has(runId) && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		assert.ok(seen.has(runId), `expected to observe runId; saw=${[...seen].join(",")}`);
	} finally {
		closeWatcher(watcher);
		fs.rmSync(stateDir, { recursive: true, force: true });
	}
});
