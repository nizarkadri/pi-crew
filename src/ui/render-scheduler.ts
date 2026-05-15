import { logInternalError } from "../utils/internal-error.ts";

export interface RenderSchedulerEventBus {
	on?: (event: string, handler: (payload: unknown) => void) => (() => void) | void;
}

export interface RenderSchedulerOptions {
	debounceMs?: number;
	/**
	 * Maximum interval (ms) between auto-refreshes when no event arrives.
	 * Can be a function returning a dynamic interval — useful to tick fast
	 * while a run is active (e.g., 160ms aligned with spinner) and slow
	 * down when idle (e.g., 1000ms) without burning CPU.
	 */
	fallbackMs?: number | (() => number);
	events?: string[];
	onInvalidate?: (payload: unknown) => void;
	/**
	 * 1.9: coalesce `onInvalidate` calls per-runId within this window so that
	 * bursts of `crew.subagent.completed`-style events touching the same run
	 * trigger a single cache invalidate instead of N. Set to 0 to disable.
	 */
	invalidateCoalesceMs?: number;
}

const DEFAULT_EVENTS = [
	"crew.run.created",
	"crew.run.completed",
	"crew.run.failed",
	"crew.run.cancelled",
	"crew.subagent.completed",
	"crew.subagent.failed",
	"crew.mailbox.updated",
	"crew.mailbox.message",
];

/**
 * Coordinates UI renders with debounce + fallback polling.
 *
 * Critical: uses recursive setTimeout instead of setInterval + a rendering
 * guard (`rendering` / `pendingRender`) so that when render() takes longer
 * than the fallback interval, callbacks do NOT pile up and storm the event
 * loop.  Instead, overlapping schedules are collapsed into a single deferred
 * re-render.
 */
export class RenderScheduler {
	private readonly render: () => void;
	private readonly onInvalidate?: (payload: unknown) => void;
	private readonly debounceMs: number;
	private readonly fallbackProvider: () => number;
	private readonly fallbackMs: number;
	private readonly invalidateCoalesceMs: number;
	private debounceTimer: ReturnType<typeof setTimeout> | undefined;
	private fallbackTimer: ReturnType<typeof setTimeout> | undefined;
	private invalidateTimer: ReturnType<typeof setTimeout> | undefined;
	/** runId → most recent payload to forward when the coalesce window flushes. */
	private invalidateBuffer = new Map<string, unknown>();
	private disposed = false;
	private lastEventAt = 0;
	private rendering = false;
	private pendingRender = false;
	private readonly unsubs: Array<() => void> = [];

	constructor(events: RenderSchedulerEventBus | undefined, render: () => void, options: RenderSchedulerOptions = {}) {
		this.render = render;
		this.onInvalidate = options.onInvalidate;
		this.debounceMs = options.debounceMs ?? 75;
		const fallback = options.fallbackMs ?? 750;
		this.fallbackProvider = typeof fallback === "function" ? fallback : () => fallback;
		this.fallbackMs = typeof fallback === "number" ? fallback : 750;
		this.invalidateCoalesceMs = options.invalidateCoalesceMs ?? 50;
		for (const event of options.events ?? DEFAULT_EVENTS) this.subscribe(events, event);
		this.fallbackTimer = setTimeout(() => this.fallbackLoop(), this.currentFallbackMs());
		this.fallbackTimer.unref();
	}

	private currentFallbackMs(): number {
		try {
			const value = this.fallbackProvider();
			return Number.isFinite(value) && value > 0 ? value : 750;
		} catch (error) {
			logInternalError("render-scheduler.fallbackProvider", error);
			return 750;
		}
	}

	private subscribe(events: RenderSchedulerEventBus | undefined, event: string): void {
		if (!events?.on) return;
		const handler = (payload: unknown): void => this.schedule(payload);
		try {
			const unsub = events.on(event, handler);
			if (typeof unsub === "function") this.unsubs.push(unsub);
		} catch (error) {
			logInternalError("render-scheduler.subscribe", error, event);
		}
	}

	/** Recursive setTimeout — avoids setInterval timer storms. */
	private fallbackLoop(): void {
		if (this.disposed) return;
		const fallbackMs = this.currentFallbackMs();
		if (Date.now() - this.lastEventAt < fallbackMs) {
			if (this.disposed) return;
			this.fallbackTimer = setTimeout(() => this.fallbackLoop(), fallbackMs);
			this.fallbackTimer.unref();
			return;
		}
		this.schedule();
		if (this.disposed) return;
		this.fallbackTimer = setTimeout(() => this.fallbackLoop(), this.currentFallbackMs());
		this.fallbackTimer.unref();
	}

	schedule(payload?: unknown): void {
		if (this.disposed) return;
		this.lastEventAt = Date.now();
		this.invalidate(payload);
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = undefined;
			this.flush();
		}, this.debounceMs);
		this.debounceTimer.unref();
	}

	/**
	 * 1.9: forward `onInvalidate` immediately when the payload has no `runId`
	 * (we cannot dedup it). When it carries a runId, buffer the latest payload
	 * per runId and flush on a coalesce timer so high-frequency event bursts
	 * (`crew.subagent.completed` for parallel tasks) collapse into one
	 * invalidate per affected run.
	 */
	private invalidate(payload: unknown): void {
		try {
			const runId = typeof payload === "object" && payload !== null && "runId" in payload && typeof (payload as { runId: unknown }).runId === "string"
				? (payload as { runId: string }).runId
				: undefined;
			if (runId === undefined || this.invalidateCoalesceMs <= 0) {
				this.onInvalidate?.(payload);
				return;
			}
			this.invalidateBuffer.set(runId, payload);
			if (!this.invalidateTimer) {
				this.invalidateTimer = setTimeout(() => this.flushInvalidate(), this.invalidateCoalesceMs);
				this.invalidateTimer.unref();
			}
		} catch (error) {
			logInternalError("render-scheduler.invalidate", error);
		}
	}

	private flushInvalidate(): void {
		this.invalidateTimer = undefined;
		if (this.disposed) {
			this.invalidateBuffer.clear();
			return;
		}
		const buffered = this.invalidateBuffer;
		this.invalidateBuffer = new Map();
		for (const payload of buffered.values()) {
			try {
				this.onInvalidate?.(payload);
			} catch (error) {
				logInternalError("render-scheduler.invalidate.flush", error);
			}
		}
	}

	/**
	 * Flush a render.  If a render is already in progress the request is
	 * collapsed: `pendingRender` is set and the caller that holds
	 * `rendering==true` will loop one more time after finishing.
	 */
	flush(): void {
		if (this.disposed) return;
		if (this.rendering) {
			this.pendingRender = true;
			return;
		}
		this.rendering = true;
		this.pendingRender = false;
		let iterations = 0;
		try {
			do {
				this.pendingRender = false;
				this.render();
				iterations += 1;
				// Safety valve: 5 re-renders max per flush to prevent infinite loops
				// if render() itself calls flush() synchronously.
			} while (this.pendingRender && !this.disposed && iterations < 5);
		} catch (error) {
			logInternalError("render-scheduler.render", error);
		} finally {
			this.rendering = false;
			// If we hit the iteration cap, schedule one more render to drain.
			if (iterations >= 5 && this.pendingRender && !this.disposed) {
				this.schedule();
			}
		}
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
		if (this.invalidateTimer) clearTimeout(this.invalidateTimer);
		this.debounceTimer = undefined;
		this.fallbackTimer = undefined;
		this.invalidateTimer = undefined;
		this.invalidateBuffer.clear();
		for (const unsub of this.unsubs.splice(0)) {
			try { unsub(); } catch (error) { logInternalError("render-scheduler.unsubscribe", error); }
		}
	}
}
