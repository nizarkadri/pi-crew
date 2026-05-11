import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { TeamToolParamsValue } from "../schema/team-tool-schema.ts";
// Lazy-loaded to avoid pulling team-tool.ts (and its entire runtime chain) into module load.
import type { handleTeamTool as HandleTeamToolFn } from "./team-tool.ts";
let _cachedHandleTeamTool: typeof HandleTeamToolFn | undefined;
async function handleTeamTool(params: Parameters<typeof HandleTeamToolFn>[0], ctx: Parameters<typeof HandleTeamToolFn>[1]): Promise<Awaited<ReturnType<typeof HandleTeamToolFn>>> {
	if (!_cachedHandleTeamTool) {
		const mod = await import("./team-tool.ts");
		_cachedHandleTeamTool = mod.handleTeamTool;
	}
	return _cachedHandleTeamTool(params, ctx);
}
import { parseLiveControlRealtimeMessage, publishLiveControlRealtime } from "../runtime/live-control-realtime.ts";

export interface EventBusLike {
	on(event: string, handler: (data: unknown) => void): (() => void) | void;
	emit(event: string, data: unknown): void;
}

export type RpcReply<T = unknown> = { success: true; data?: T } | { success: false; error: string };
export const PI_CREW_RPC_VERSION = 1;

export interface PiCrewRpcHandle {
	unsubscribe(): void;
}

function requestId(raw: unknown): string | undefined {
	return raw && typeof raw === "object" && !Array.isArray(raw) && typeof (raw as { requestId?: unknown }).requestId === "string" ? (raw as { requestId: string }).requestId : undefined;
}

function reply(events: EventBusLike, channel: string, id: string | undefined, payload: RpcReply): void {
	if (!id) return;
	events.emit(`${channel}:reply:${id}`, payload);
}

function textOf(result: Awaited<ReturnType<typeof handleTeamTool>>): string {
	return result.content?.map((item) => item.type === "text" ? item.text : "").join("\n") ?? "";
}

function on(events: EventBusLike, channel: string, handler: (raw: unknown) => void): () => void {
	const unsub = events.on(channel, handler);
	return typeof unsub === "function" ? unsub : () => {};
}

export function registerPiCrewRpc(events: EventBusLike | undefined, getCtx: () => ExtensionContext | undefined): PiCrewRpcHandle | undefined {
	if (!events) return undefined;
	const unsubs = [
		on(events, "pi-crew:rpc:ping", (raw) => reply(events, "pi-crew:rpc:ping", requestId(raw), { success: true, data: { version: PI_CREW_RPC_VERSION } })),
		on(events, "pi-crew:rpc:run", async (raw) => {
			const id = requestId(raw);
			try {
				const ctx = getCtx();
				if (!ctx) throw new Error("No active pi-crew session context.");
				// Validate payload: only allow known fields from TeamToolParamsValue
				const ALLOWED_RPC_RUN_KEYS = new Set(["goal", "team", "workflow", "async", "cwd", "config", "skill", "model"]);
				let params: TeamToolParamsValue;
				if (raw && typeof raw === "object" && !Array.isArray(raw)) {
					const filtered: Record<string, unknown> = { ...(raw as object) };
					// Strip any keys not in the allowlist to prevent injection of unexpected fields
					for (const key of Object.keys(filtered)) {
						if (!ALLOWED_RPC_RUN_KEYS.has(key)) delete filtered[key];
					}
					params = { ...filtered, action: "run" } as TeamToolParamsValue;
				} else {
					params = { action: "run" };
				}
				const result = await handleTeamTool(params, ctx);
				reply(events, "pi-crew:rpc:run", id, result.isError ? { success: false, error: textOf(result) } : { success: true, data: result.details });
			} catch (error) {
				reply(events, "pi-crew:rpc:run", id, { success: false, error: error instanceof Error ? error.message : String(error) });
			}
		}),
		on(events, "pi-crew:rpc:status", async (raw) => {
			const id = requestId(raw);
			try {
				const ctx = getCtx();
				if (!ctx) throw new Error("No active pi-crew session context.");
				const runId = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { runId?: string }).runId : undefined;
				const result = await handleTeamTool({ action: "status", runId }, ctx);
				reply(events, "pi-crew:rpc:status", id, result.isError ? { success: false, error: textOf(result) } : { success: true, data: { text: textOf(result), details: result.details } });
			} catch (error) {
				reply(events, "pi-crew:rpc:status", id, { success: false, error: error instanceof Error ? error.message : String(error) });
			}
		}),
		on(events, "pi-crew:live-control", (raw) => {
			const request = parseLiveControlRealtimeMessage(raw);
			if (request) publishLiveControlRealtime(request);
		}),
		on(events, "pi-crew:rpc:live-control", async (raw) => {
			const id = requestId(raw);
			try {
				const ctx = getCtx();
				if (!ctx) throw new Error("No active pi-crew session context.");
				const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
				const result = await handleTeamTool({ action: "api", runId: typeof obj.runId === "string" ? obj.runId : undefined, config: { operation: typeof obj.operation === "string" ? obj.operation : "steer-agent", agentId: obj.agentId, message: obj.message, prompt: obj.prompt } }, ctx);
				reply(events, "pi-crew:rpc:live-control", id, result.isError ? { success: false, error: textOf(result) } : { success: true, data: { text: textOf(result), details: result.details } });
			} catch (error) {
				reply(events, "pi-crew:rpc:live-control", id, { success: false, error: error instanceof Error ? error.message : String(error) });
			}
		}),
	];
	return { unsubscribe: () => unsubs.forEach((unsub) => unsub()) };
}
