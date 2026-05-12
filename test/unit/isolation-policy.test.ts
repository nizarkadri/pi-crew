import test from "node:test";
import assert from "node:assert/strict";
import { resolveTaskRuntimeKind } from "../../src/runtime/runtime-policy.ts";

test("isolation policy defaults non-isolated roles to configured runtime", () => {
	assert.equal(resolveTaskRuntimeKind("live-session", "reviewer", { defaultRuntime: "child-process" }), "child-process");
	assert.equal(resolveTaskRuntimeKind("child-process", "reviewer", { defaultRuntime: "live-session" }), "live-session");
});

test("isolation policy isolated roles always use child-process unless scaffold", () => {
	assert.equal(resolveTaskRuntimeKind("live-session", "executor", { isolatedRoles: ["executor"], defaultRuntime: "live-session" }), "child-process");
	assert.equal(resolveTaskRuntimeKind("scaffold", "executor", { isolatedRoles: ["executor"], defaultRuntime: "child-process" }), "scaffold");
});
