import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { handleTeamTool } from "../../src/extension/team-tool.ts";
import {
	createTrackedTempDir,
	removeTrackedTempDir,
} from "../fixtures/test-tempdir.ts";
import { firstText } from "../fixtures/tool-result-helpers.ts";

function restoreEnv(name: string, previous: string | undefined): void {
	if (previous === undefined) delete process.env[name];
	else process.env[name] = previous;
}

test("wait returns immediately for already-completed run", async () => {
	const previousMock = process.env.PI_CREW_MOCK_LIVE_SESSION;
	const previousDepth = process.env.PI_CREW_DEPTH;
	process.env.PI_CREW_MOCK_LIVE_SESSION = "success";
	process.env.PI_CREW_DEPTH = "0";
	const cwd = createTrackedTempDir("pi-crew-wait-done-");
	try {
		fs.mkdirSync(path.join(cwd, ".crew"), { recursive: true });
		// Run a fast task that completes synchronously (mock mode)
		const run = await handleTeamTool(
			{
				action: "run",
				team: "fast-fix",
				goal: "wait test",
				config: { runtime: { mode: "live-session" } },
			},
			{ cwd },
		);
		assert.equal(run.isError, false);
		const runId = run.details.runId!;

		// wait should return immediately since run is already completed
		const waitResult = await handleTeamTool(
			{ action: "wait", runId, config: { timeoutMs: 5000 } },
			{ cwd },
		);
		assert.equal(waitResult.isError, false);
		assert.match(firstText(waitResult), /finished: completed/);
	} finally {
		restoreEnv("PI_CREW_MOCK_LIVE_SESSION", previousMock);
		restoreEnv("PI_CREW_DEPTH", previousDepth);
		removeTrackedTempDir(cwd);
	}
});

test("wait returns error for missing runId", async () => {
	const cwd = createTrackedTempDir("pi-crew-wait-noid-");
	try {
		const waitResult = await handleTeamTool(
			{ action: "wait", config: { timeoutMs: 1000 } },
			{ cwd },
		);
		assert.equal(waitResult.isError, true);
		assert.match(firstText(waitResult), /wait requires runId/);
	} finally {
		removeTrackedTempDir(cwd);
	}
});

test("wait returns error for non-existent run", async () => {
	const cwd = createTrackedTempDir("pi-crew-wait-noexist-");
	try {
		fs.mkdirSync(path.join(cwd, ".crew"), { recursive: true });
		const waitResult = await handleTeamTool(
			{
				action: "wait",
				runId: "nonexistent-run-12345",
				config: { timeoutMs: 500 },
			},
			{ cwd },
		);
		assert.equal(waitResult.isError, true);
		assert.match(firstText(waitResult), /not found/);
	} finally {
		removeTrackedTempDir(cwd);
	}
});
