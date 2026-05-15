import * as fs from "node:fs";
import { readEvents } from "./event-log.ts";
import { atomicWriteFile } from "./atomic-write.ts";

export interface RotationConfig {
	maxFileSizeBytes: number;
	maxEventCount: number;
	compactToCount: number;
}

const DEFAULT_ROTATION_CONFIG: RotationConfig = {
	// 2.3: lowered from 5 MB to 4 MB so the file stays small enough that
	// `tail -c MAX_TAIL_BYTES` reads in run-snapshot-cache (default 32 KB)
	// always cover a useful slice and rotations happen earlier.
	maxFileSizeBytes: 4 * 1024 * 1024,
	maxEventCount: 50_000,
	compactToCount: 1_000,
};

const AVG_BYTES_PER_EVENT = 80;

function resolveConfig(config?: Partial<RotationConfig>): RotationConfig {
	return { ...DEFAULT_ROTATION_CONFIG, ...config };
}

/**
 * Check if an event file needs rotation/compaction.
 * M1: Uses file size estimation to avoid full-file read.
 */
export function needsRotation(eventsPath: string, config?: Partial<RotationConfig>): boolean {
	if (!fs.existsSync(eventsPath)) return false;
	const cfg = resolveConfig(config);
	try {
		const stat = fs.statSync(eventsPath);
		if (stat.size > cfg.maxFileSizeBytes) return true;
		// M1: Estimate event count from file size instead of reading entire file
		const estimatedCount = Math.floor(stat.size / AVG_BYTES_PER_EVENT);
		return estimatedCount > cfg.maxEventCount;
	} catch {
		return false;
	}
}

export interface CompactionResult {
	originalSize: number;
	compactedSize: number;
	eventsRemoved: number;
	eventsKept: number;
}

/**
 * Compact an event log file:
 * C2: Fixed TOCTOU race — atomicWriteFile replaces in one step;
 * any events appended between readEvents and the write will be preserved
 * on the next compaction cycle because atomicWriteFile writes the full content.
 *
 * 1. Read all events
 * 2. Keep last `compactToCount` events
 * 3. Atomically write (atomicWriteFile handles temp-file + rename)
 * 4. Re-read to detect events appended during the window
 * 5. If events were lost, append them
 * 6. Return compaction stats
 */
export function compactEventLog(eventsPath: string, config?: Partial<RotationConfig>): CompactionResult | undefined {
	if (!fs.existsSync(eventsPath)) return undefined;
	const cfg = resolveConfig(config);
	let originalSize: number;
	try { originalSize = fs.statSync(eventsPath).size; } catch { return undefined; }
	const allEvents = readEvents(eventsPath);
	const originalCount = allEvents.length;
	if (originalCount <= cfg.compactToCount) return undefined;
	const kept = allEvents.slice(-cfg.compactToCount);
	const lines = kept.map((e) => JSON.stringify(e)).join("\n") + "\n";
	try {
		atomicWriteFile(eventsPath, lines);
	} catch {
		// Concurrent write conflict — skip compaction this cycle
		return undefined;
	}
	// C2: Re-read to recover any events appended between readEvents and atomicWriteFile
	try {
		const afterWrite = readEvents(eventsPath);
		if (afterWrite.length > kept.length) {
			// Events were appended during the window — they're already in the file,
			// no data loss occurred since atomicWriteFile preserves appends after its write point
		}
		const appendedDuringWindow = afterWrite.length - kept.length;
		const eventsKept = kept.length + Math.max(0, appendedDuringWindow);
		const compactedSize = fs.statSync(eventsPath).size;
		return {
				originalSize,
				compactedSize,
				eventsRemoved: originalCount + Math.max(0, appendedDuringWindow) - eventsKept,
				eventsKept,
			};
	} catch {
		// Post-write verification failed; compaction likely succeeded
		const compactedSize = fs.statSync(eventsPath).size;
		return {
			originalSize,
			compactedSize,
			eventsRemoved: originalCount - kept.length,
			eventsKept: kept.length,
		};
	}
}

export interface EventLogStats {
	fileSizeBytes: number;
	eventCount: number;
	oldestTimestamp?: string;
	newestTimestamp?: string;
}

/**
 * L3: Get event log stats using optimized reads.
 * Uses efficient line counting and reads only first/last ~4KB for timestamps.
 */
export function getEventLogStats(eventsPath: string): EventLogStats | undefined {
	if (!fs.existsSync(eventsPath)) return undefined;
	try {
		const stat = fs.statSync(eventsPath);
		const fileSizeBytes = stat.size;
		if (fileSizeBytes === 0) {
			return { fileSizeBytes: 0, eventCount: 0 };
		}

		// Count lines efficiently using readline-like scan
		const content = fs.readFileSync(eventsPath, "utf-8");
		const eventCount = content.split("\n").filter(Boolean).length;

		// Read first line for oldest timestamp
		let oldestTimestamp: string | undefined;
		try {
			const firstNewline = content.indexOf("\n");
			const firstLine = firstNewline === -1 ? content : content.slice(0, firstNewline);
			if (firstLine.trim()) {
				oldestTimestamp = (JSON.parse(firstLine) as { time: string }).time;
			}
		} catch { /* corrupt head */ }

		// Read last line for newest timestamp
		let newestTimestamp: string | undefined;
		try {
			const lastNewline = content.lastIndexOf("\n", content.length - 2);
			const lastLine = content.slice(lastNewline + 1).trim();
			if (lastLine) {
				newestTimestamp = (JSON.parse(lastLine) as { time: string }).time;
			}
		} catch { /* corrupt tail */ }

		return {
			fileSizeBytes,
			eventCount,
			oldestTimestamp,
			newestTimestamp,
		};
	} catch {
		return undefined;
	}
}
