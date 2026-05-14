import * as fs from "node:fs";
import * as path from "node:path";
import type { FSWatcher, WatchListener } from "node:fs";

export const FS_WATCH_RETRY_DELAY_MS = 5000;

export function closeWatcher(watcher: FSWatcher | null | undefined): void {
	if (!watcher) {
		return;
	}

	try {
		watcher.close();
	} catch {
		// Ignore watcher close errors
	}
}

export function watchWithErrorHandler(
	path: string,
	listener: WatchListener<string>,
	onError: (error?: unknown) => void,
): FSWatcher | null {
	try {
		const watcher = fs.watch(path, listener);
		watcher.on("error", onError);
		return watcher;
	} catch (error) {
		onError(error);
		return null;
	}
}

/**
 * 1.3 — Watch a directory recursively and invoke `onChange` when any file
 * inside changes. Falls back to `null` on systems where `fs.watch` rejects
 * recursive mode (e.g., Linux when running on older kernels via FUSE/network FS).
 *
 * Callers MUST handle null and fall back to polling. The watcher emits the
 * filename relative to `rootDir` (forward-slash normalised on Windows).
 */
export function createRecursiveWatcher(
	rootDir: string,
	onChange: (relativePath: string) => void,
	onError: (error: unknown) => void,
): FSWatcher | null {
	try {
		if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true });
		const watcher = fs.watch(rootDir, { recursive: true }, (_eventType, filename) => {
			if (typeof filename !== "string" || filename.length === 0) return;
			onChange(filename.replace(/\\/g, "/"));
		});
		watcher.on("error", (error) => {
			try { watcher.close(); } catch { /* ignore */ }
			onError(error);
		});
		return watcher;
	} catch (error) {
		onError(error);
		return null;
	}
}

/**
 * Given a path relative to `<crewRoot>/state`, return the runId that owns
 * the change, or undefined if the path doesn't match any tracked run layout.
 */
export function runIdFromStateRelativePath(relativePath: string): string | undefined {
	const parts = relativePath.split("/");
	// Layout is `runs/{runId}/...` — see docs/architecture.md state layer.
	if (parts.length >= 2 && parts[0] === "runs" && parts[1]) return parts[1];
	return undefined;
}

/** Convenience: combine the two helpers for `<crewRoot>/state` watching. */
export function watchCrewState(
	stateDir: string,
	onRunChange: (runId: string) => void,
	onError: (error: unknown) => void,
): FSWatcher | null {
	return createRecursiveWatcher(stateDir, (relativePath) => {
		const runId = runIdFromStateRelativePath(relativePath);
		if (runId) onRunChange(runId);
	}, onError);
}

// Re-export path helper so callers don't pull node:path just for join.
export const joinPath = path.join;
