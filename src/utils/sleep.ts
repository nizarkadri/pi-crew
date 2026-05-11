/**
 * Synchronous sleep using Atomics.wait (non-busy) with low-CPU fallback.
 *
 * WARNING: This blocks the Node.js main thread. Only use in sync I/O paths
 * where blocking is acceptable (lock acquisition, rename retry).
 * NOT safe to call from Pi extension async code paths.
 */
export function sleepSync(ms: number): void {
	try {
		const buffer = new SharedArrayBuffer(4);
		Atomics.wait(new Int32Array(buffer), 0, 0, ms);
	} catch {
		// Fallback for environments without Atomics.wait (e.g. Windows).
		// On Unix, try spawning the `sleep` command to avoid CPU busy-wait.
		if (process.platform !== "win32" && ms >= 10) {
			try {
				const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
				execFileSync("sleep", [(ms / 1000).toFixed(3)], { timeout: ms + 1000, stdio: "pipe" });
				return;
			} catch {
				// sleep command unavailable — fall through to busy-wait
			}
		}
		// Last resort: busy-wait. This burns CPU but is the only guaranteed
		// synchronous delay on Windows without SharedArrayBuffer.
		const deadline = Date.now() + ms;
		while (Date.now() < deadline) {
			// Busy-wait fallback for environments without Atomics.wait.
		}
	}
}

/**
 * Async sleep with optional AbortSignal support.
 * Rejects immediately if the signal is already aborted, or when aborted during wait.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) return Promise.reject(new Error("aborted"));
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener("abort", () => {
			clearTimeout(timer);
			reject(new Error("aborted"));
		}, { once: true });
	});
}
