/**
 * Phase progress calculator for pi-crew runs.
 *
 * Groups tasks by their adaptive phase metadata and computes per-phase
 * and overall progress metrics including estimated remaining time.
 */
import type { TeamTaskState } from "../state/types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhaseInfo {
	/** Phase name, e.g. "explore", "plan", "execute", "verify" */
	phase: string;
	/** 0-based index among all phases */
	index: number;
	/** Total tasks in this phase */
	total: number;
	/** Completed tasks */
	completed: number;
	/** Failed tasks */
	failed: number;
	/** Currently running tasks */
	running: number;
	/** Still queued (not started) */
	queued: number;
	/** (completed + failed) / total * 100, rounded to 1 decimal */
	percentage: number;
}

export interface RunProgress {
	/** Breakdown per phase, in phase order */
	phases: PhaseInfo[];
	/** Overall (completed + failed) / total * 100 */
	overallPercentage: number;
	/** Phase that currently has running or queued tasks, or null */
	currentPhase: string | null;
	/** Estimated remaining ms based on avg task duration × remaining tasks */
	estimatedRemainingMs: number;
	/** Total task count */
	totalTasks: number;
	/** Completed task count */
	completedTasks: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "skipped"]);

/**
 * Extract the phase label for a task.
 *
 * Priority:
 * 1. `task.adaptive.phase` (set by adaptive planner)
 * 2. Infer from stepId prefix: `adaptive-<phaseIndex>-...` → use the numeric phase index
 * 3. Fallback: `"default"`
 */
function extractPhase(task: TeamTaskState): string {
	if (task.adaptive?.phase) return task.adaptive.phase;
	if (task.stepId?.startsWith("adaptive-")) {
		const parts = task.stepId.split("-");
		// adaptive-<phaseIndex>-<taskIndex>-<role> → parts[1] is the phase index
		if (parts.length >= 3 && parts[1]) return parts[1];
	}
	return "default";
}

/**
 * Compute task duration in ms from startedAt → finishedAt.
 * Returns undefined if timestamps are missing or invalid.
 */
function taskDurationMs(task: TeamTaskState): number | undefined {
	if (!task.startedAt || !task.finishedAt) return undefined;
	const start = new Date(task.startedAt).getTime();
	const end = new Date(task.finishedAt).getTime();
	const duration = end - start;
	return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Compute phase-aware progress for a set of tasks.
 *
 * Groups tasks by phase, calculates per-phase and overall percentages,
 * and estimates remaining time from the average duration of completed tasks.
 */
export function computePhaseProgress(tasks: TeamTaskState[]): RunProgress {
	if (tasks.length === 0) {
		return {
			phases: [],
			overallPercentage: 0,
			currentPhase: null,
			estimatedRemainingMs: 0,
			totalTasks: 0,
			completedTasks: 0,
		};
	}

	// Preserve insertion order of first-seen phase
	const phaseOrder: string[] = [];
	const phaseGroups = new Map<string, TeamTaskState[]>();

	for (const task of tasks) {
		const phase = extractPhase(task);
		if (!phaseGroups.has(phase)) {
			phaseGroups.set(phase, []);
			phaseOrder.push(phase);
		}
		phaseGroups.get(phase)!.push(task);
	}

	let totalCompleted = 0;
	let totalTerminal = 0;
	let totalDurationSum = 0;
	let totalDurationCount = 0;
	let currentPhase: string | null = null;

	const phases: PhaseInfo[] = phaseOrder.map((phase, index) => {
		const group = phaseGroups.get(phase)!;
		let completed = 0;
		let failed = 0;
		let running = 0;
		let queued = 0;
		let hasRunningOrQueued = false;

		for (const task of group) {
			const status = task.status;
			if (status === "completed") {
				completed++;
				totalCompleted++;
				totalTerminal++;
				const dur = taskDurationMs(task);
				if (dur !== undefined) {
					totalDurationSum += dur;
					totalDurationCount++;
				}
			} else if (status === "failed") {
				failed++;
				totalTerminal++;
				const dur = taskDurationMs(task);
				if (dur !== undefined) {
					totalDurationSum += dur;
					totalDurationCount++;
				}
			} else if (status === "running" || status === "waiting") {
				running++;
				hasRunningOrQueued = true;
			} else if (status === "queued") {
				queued++;
				hasRunningOrQueued = true;
			}
			// cancelled, skipped → counted in total but not completed/failed
		}

		if (hasRunningOrQueued && currentPhase === null) {
			currentPhase = phase;
		}

		const terminal = completed + failed;
		const percentage = group.length > 0 ? Math.round((terminal / group.length) * 1000) / 10 : 0;

		return {
			phase,
			index,
			total: group.length,
			completed,
			failed,
			running,
			queued,
			percentage,
		};
	});

	const overallPercentage = tasks.length > 0 ? Math.round((totalTerminal / tasks.length) * 1000) / 10 : 0;

	// Estimate remaining time: avg duration × remaining non-terminal tasks
	const remainingTasks = tasks.length - totalTerminal;
	let estimatedRemainingMs = 0;
	if (totalDurationCount > 0 && remainingTasks > 0) {
		const avgDuration = totalDurationSum / totalDurationCount;
		estimatedRemainingMs = Math.round(avgDuration * remainingTasks);
	}

	return {
		phases,
		overallPercentage,
		currentPhase,
		estimatedRemainingMs,
		totalTasks: tasks.length,
		completedTasks: totalCompleted,
	};
}

/**
 * Format a human-readable phase progress line.
 *
 * Example: "Phase 2/4 execute: 60.0% (3/5)"
 * Returns empty string when there are no phases.
 */
export function formatPhaseProgressLine(runProgress: RunProgress): string {
	if (runProgress.phases.length === 0) return "";
	const current = runProgress.currentPhase;
	if (!current) {
		// All done — show summary
		return `All ${runProgress.phases.length} phases done: ${runProgress.overallPercentage}% (${runProgress.completedTasks}/${runProgress.totalTasks})`;
	}
	const currentPhaseInfo = runProgress.phases.find((p) => p.phase === current);
	if (!currentPhaseInfo) return `${runProgress.overallPercentage}% done`;
	const done = currentPhaseInfo.completed + currentPhaseInfo.failed;
	return `Phase ${currentPhaseInfo.index + 1}/${runProgress.phases.length} ${current}: ${currentPhaseInfo.percentage}% (${done}/${currentPhaseInfo.total})`;
}
