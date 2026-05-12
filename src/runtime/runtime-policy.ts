import type { CrewRuntimeConfig } from "../config/config.ts";
import type { CrewRuntimeKind } from "./crew-agent-runtime.ts";

/**
 * Resolve the effective runtime kind for a given task role using isolation policy.
 * - scaffold is never overridden — scaffold stays scaffold.
 * - If the role appears in `isolationPolicy.isolatedRoles`, use child-process (crash isolation).
 * - Otherwise, use `isolationPolicy.defaultRuntime` when configured, then fall back to globalKind.
 */
export function resolveTaskRuntimeKind(globalKind: CrewRuntimeKind, role: string, isolationPolicy: CrewRuntimeConfig["isolationPolicy"]): CrewRuntimeKind {
	if (globalKind === "scaffold") return "scaffold";
	const isolatedRoles = isolationPolicy?.isolatedRoles ?? [];
	if (isolatedRoles.includes(role)) return "child-process";
	return isolationPolicy?.defaultRuntime ?? globalKind;
}
