import type { TeamRunManifest, TeamTaskState } from "../state/types.ts";
import { loadRunManifestById } from "../state/state-store.ts";
import { isFinishedRunStatus } from "./process-status.ts";

export interface ActiveRunPromise {
	promise: Promise<{ manifest: TeamRunManifest; tasks: TeamTaskState[] }>;
	resolve: (value: { manifest: TeamRunManifest; tasks: TeamTaskState[] }) => void;
	reject: (reason: unknown) => void;
}

const activeRunPromises = new Map<string, ActiveRunPromise>();

export function registerRunPromise(runId: string): ActiveRunPromise {
	let resolve!: (value: { manifest: TeamRunManifest; tasks: TeamTaskState[] }) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<{ manifest: TeamRunManifest; tasks: TeamTaskState[] }>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	const entry: ActiveRunPromise = { promise, resolve, reject };
	activeRunPromises.set(runId, entry);
	return entry;
}

export function resolveRunPromise(runId: string, result: { manifest: TeamRunManifest; tasks: TeamTaskState[] }): void {
	const entry = activeRunPromises.get(runId);
	if (entry) {
		entry.resolve(result);
		activeRunPromises.delete(runId);
	}
}

export function rejectRunPromise(runId: string, reason: unknown): void {
	const entry = activeRunPromises.get(runId);
	if (entry) {
		entry.reject(reason);
		activeRunPromises.delete(runId);
	}
}

/**
 * Wait for a team run to reach a terminal status.
 * - If the run is already finished on disk, returns immediately.
 * - If a foreground promise is registered for this runId, awaits it.
 * - Otherwise falls back to lightweight fs.watchFile-based waiting.
 */
export async function waitForRun(
	runId: string,
	cwd: string,
	options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<{ manifest: TeamRunManifest; tasks: TeamTaskState[] }> {
	const { timeoutMs = 300_000, pollIntervalMs = 500 } = options;
	const deadline = Date.now() + timeoutMs;

	// Fast path: already terminal on disk
	const loaded = loadRunManifestById(cwd, runId);
	if (loaded && isFinishedRunStatus(loaded.manifest.status)) {
		return loaded;
	}

	// Medium path: foreground promise registered in this process
	const entry = activeRunPromises.get(runId);
	if (entry) {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeoutPromise = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error(`waitForRun timed out after ${timeoutMs}ms`)), timeoutMs);
		});
		try {
			return await Promise.race([entry.promise, timeoutPromise]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	// Slow path: background run — poll with exponential backoff capped at pollIntervalMs
	let attempt = 0;
	while (Date.now() < deadline) {
		const fresh = loadRunManifestById(cwd, runId);
		if (fresh && isFinishedRunStatus(fresh.manifest.status)) {
			return fresh;
		}
		const delay = Math.min(pollIntervalMs, 50 * 2 ** Math.min(attempt, 6)); // max ~3.2s
		await new Promise((r) => setTimeout(r, delay));
		attempt++;
	}

	throw new Error(`waitForRun timed out after ${timeoutMs}ms`);
}

export function hasActiveRunPromise(runId: string): boolean {
	return activeRunPromises.has(runId);
}

export function clearRunPromisesForTest(): void {
	for (const entry of activeRunPromises.values()) {
		entry.reject(new Error("Cleared by test"));
	}
	activeRunPromises.clear();
}
