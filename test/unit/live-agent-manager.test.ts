import test from "node:test";
import assert from "node:assert/strict";
import { clearLiveAgentsForTest, followUpLiveAgent, listActiveLiveAgents, listLiveAgents, registerLiveAgent, terminateLiveAgent } from "../../src/runtime/live-agent-manager.ts";

test("followUpLiveAgent queues and flushes pending follow-ups through prompt", async () => {
	const prompts: string[] = [];
	try {
		registerLiveAgent({ agentId: "agent", taskId: "task", runId: "run", status: "running", session: {} });
		const pending = await followUpLiveAgent("agent", "review this next");
		assert.deepEqual(pending.pendingFollowUps, ["review this next"]);
		registerLiveAgent({ agentId: "agent", taskId: "task", runId: "run", status: "running", session: { prompt: async (text: string) => { prompts.push(text); } } });
		await new Promise((resolve) => setTimeout(resolve, 0));
		assert.deepEqual(prompts, ["review this next"]);
		assert.deepEqual(registerLiveAgent({ agentId: "agent", taskId: "task", runId: "run", status: "running", session: {} }).pendingFollowUps, []);
	} finally {
		clearLiveAgentsForTest();
	}
});

test("terminateLiveAgent aborts before removing the live handle", async () => {
	const calls: string[] = [];
	try {
		registerLiveAgent({ agentId: "agent", taskId: "task", runId: "run", status: "running", session: { abort: async () => { calls.push("abort"); }, dispose: () => { calls.push("dispose"); } } });
		const terminated = await terminateLiveAgent("agent", "failed");
		assert.equal(terminated?.status, "failed");
		assert.deepEqual(calls, ["abort", "dispose"]);
		assert.equal(listLiveAgents().length, 0);
	} finally {
		clearLiveAgentsForTest();
	}
});

test("listActiveLiveAgents excludes terminal handles kept for resume", () => {
	try {
		registerLiveAgent({ agentId: "done", taskId: "task", runId: "run", status: "completed", session: {} });
		registerLiveAgent({ agentId: "active", taskId: "task2", runId: "run", status: "running", session: {} });
		assert.equal(listLiveAgents().length, 2);
		assert.deepEqual(listActiveLiveAgents().map((agent) => agent.agentId), ["active"]);
	} finally {
		clearLiveAgentsForTest();
	}
});
