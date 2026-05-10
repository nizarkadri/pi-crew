/**
 * Delta conflict detection for pi-crew import and resume operations.
 *
 * Compares incoming bundles against existing state to surface conflicts
 * (file overwrites, status mismatches, schema drift, deleted resources)
 * without blocking the operation — only reporting for user awareness.
 */

// ── Types ──────────────────────────────────────────────────────────────

export type ConflictKind = "file_overwrite" | "state_mismatch" | "schema_drift" | "resource_deleted";

export interface Conflict {
	kind: ConflictKind;
	/** File or resource path that is in conflict. */
	path: string;
	/** Current value or summary (optional). */
	existing?: string;
	/** Incoming value or summary (optional). */
	incoming?: string;
	severity: "error" | "warning";
	autoResolvable: boolean;
}

export interface ConflictReport {
	hasConflicts: boolean;
	conflicts: Conflict[];
	summary: { errors: number; warnings: number; autoResolvable: number };
}

export type ConflictStrategy = "skip" | "overwrite" | "merge";

export interface ConflictResolution {
	resolved: boolean;
	action: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

interface TaskLike {
	id: string;
	status: string;
	role?: string;
	agent?: string;
}

function buildReport(conflicts: Conflict[]): ConflictReport {
	const errors = conflicts.filter((c) => c.severity === "error").length;
	const warnings = conflicts.filter((c) => c.severity === "warning").length;
	const autoResolvable = conflicts.filter((c) => c.autoResolvable).length;
	return {
		hasConflicts: conflicts.length > 0,
		conflicts,
		summary: { errors, warnings, autoResolvable },
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Extract task-like objects from an unknown array, filtering out non-records.
 */
function extractTaskLikes(tasks: unknown[]): TaskLike[] {
	return tasks
		.filter(isRecord)
		.map((t) => ({
			id: typeof t.id === "string" ? t.id : "",
			status: typeof t.status === "string" ? t.status : "",
			role: typeof t.role === "string" ? t.role : undefined,
			agent: typeof t.agent === "string" ? t.agent : undefined,
		}))
		.filter((t) => t.id !== "");
}

// ── Import Conflict Detection ──────────────────────────────────────────

export interface ImportBundle {
	manifest: Record<string, unknown>;
	tasks: unknown[];
	events?: unknown[];
}

export interface ExistingState {
	manifest?: Record<string, unknown>;
	tasks?: unknown[];
}

/**
 * Detect conflicts between an import bundle and existing run state.
 *
 * Checks:
 * - **schema_drift**: manifest `schemaVersion` differs between import and existing.
 * - **file_overwrite**: artifact paths in the import bundle that already exist
 *   in the current manifest's artifact list.
 * - **state_mismatch**: task statuses differ between import and existing tasks.
 * - **resource_deleted**: referenced agent/team/workflow in import does not exist
 *   in the current state.
 */
export function detectImportConflicts(
	importBundle: ImportBundle,
	existingState: ExistingState,
): ConflictReport {
	const conflicts: Conflict[] = [];
	const { manifest: incoming, tasks: incomingTasks } = importBundle;
	const { manifest: current, tasks: currentTasks } = existingState;

	// ── Schema drift ─────────────────────────────────────────────────
	if (current) {
		const incomingVersion = incoming.schemaVersion;
		const currentVersion = current.schemaVersion;
		if (
			typeof incomingVersion !== "undefined" &&
			typeof currentVersion !== "undefined" &&
			incomingVersion !== currentVersion
		) {
			conflicts.push({
				kind: "schema_drift",
				path: "manifest.schemaVersion",
				existing: String(currentVersion),
				incoming: String(incomingVersion),
				severity: "warning",
				autoResolvable: true,
			});
		}
	}

	// ── File overwrite (artifact collision) ──────────────────────────
	const incomingArtifacts = Array.isArray(incoming.artifacts) ? incoming.artifacts : [];
	const currentArtifacts = Array.isArray(current?.artifacts) ? current?.artifacts : [];

	if (current && currentArtifacts.length > 0) {
		const currentPaths = new Set(
			currentArtifacts
				.filter(isRecord)
				.map((a) => (typeof a.path === "string" ? a.path : ""))
				.filter((p) => p !== ""),
		);

		for (const artifact of incomingArtifacts) {
			if (!isRecord(artifact)) continue;
			const artifactPath = typeof artifact.path === "string" ? artifact.path : "";
			if (artifactPath !== "" && currentPaths.has(artifactPath)) {
				conflicts.push({
					kind: "file_overwrite",
					path: artifactPath,
					existing: "present in current run",
					incoming: "present in import bundle",
					severity: "warning",
					autoResolvable: true,
				});
			}
		}
	}

	// ── State mismatch (task status differences) ─────────────────────
	if (currentTasks && currentTasks.length > 0) {
		const currentTaskMap = new Map(
			extractTaskLikes(currentTasks).map((t) => [t.id, t]),
		);
		const incomingTaskList = extractTaskLikes(incomingTasks);

		for (const inTask of incomingTaskList) {
			const curTask = currentTaskMap.get(inTask.id);
			if (curTask && curTask.status !== inTask.status) {
				conflicts.push({
					kind: "state_mismatch",
					path: `tasks/${inTask.id}`,
					existing: curTask.status,
					incoming: inTask.status,
					severity: "error",
					autoResolvable: false,
				});
			}
		}
	}

	// ── Resource deleted (agent/team/workflow no longer in current) ──
	if (current) {
		const currentTeam = typeof current.team === "string" ? current.team : undefined;
		const currentWorkflow = typeof current.workflow === "string" ? current.workflow : undefined;
		const incomingTeam = typeof incoming.team === "string" ? incoming.team : undefined;
		const incomingWorkflow = typeof incoming.workflow === "string" ? incoming.workflow : undefined;

		if (incomingTeam && currentTeam && incomingTeam !== currentTeam) {
			conflicts.push({
				kind: "resource_deleted",
				path: `team/${incomingTeam}`,
				existing: currentTeam,
				incoming: incomingTeam,
				severity: "warning",
				autoResolvable: true,
			});
		}

		if (incomingWorkflow && currentWorkflow && incomingWorkflow !== currentWorkflow) {
			conflicts.push({
				kind: "resource_deleted",
				path: `workflow/${incomingWorkflow}`,
				existing: currentWorkflow,
				incoming: incomingWorkflow,
				severity: "warning",
				autoResolvable: true,
			});
		}

		// Check agent references from tasks vs current tasks
		if (currentTasks && currentTasks.length > 0) {
			const currentAgents = new Set(
				extractTaskLikes(currentTasks)
					.map((t) => t.agent)
					.filter((a): a is string => a !== undefined),
			);
			const incomingTaskList = extractTaskLikes(incomingTasks);
			for (const inTask of incomingTaskList) {
				if (
					inTask.agent &&
					inTask.id !== "" &&
					currentAgents.size > 0 &&
					!currentAgents.has(inTask.agent) &&
					// Only flag if there's a matching task id (agent was reassigned)
					extractTaskLikes(currentTasks).some((ct) => ct.id === inTask.id)
				) {
					conflicts.push({
						kind: "resource_deleted",
						path: `agent/${inTask.agent}`,
						existing: "not in current run",
						incoming: inTask.agent,
						severity: "warning",
						autoResolvable: true,
					});
				}
			}
		}
	}

	return buildReport(conflicts);
}

// ── Resume Conflict Detection ──────────────────────────────────────────

export interface SuspendedState {
	tasks: unknown[];
	artifacts: string[];
}

export interface CurrentState {
	changedFiles: string[];
	taskStatuses: Record<string, string>;
}

/**
 * Detect conflicts when resuming a suspended run against current filesystem state.
 *
 * Checks:
 * - **file_overwrite**: files changed since suspension.
 * - **state_mismatch**: task statuses changed externally.
 */
export function detectResumeConflicts(
	suspendedState: SuspendedState,
	currentState: CurrentState,
): ConflictReport {
	const conflicts: Conflict[] = [];
	const { tasks: suspendedTasks, artifacts: suspendedArtifacts } = suspendedState;
	const { changedFiles, taskStatuses } = currentState;

	// ── File overwrite ───────────────────────────────────────────────
	const changedSet = new Set(changedFiles);
	for (const artifactPath of suspendedArtifacts) {
		if (changedSet.has(artifactPath)) {
			conflicts.push({
				kind: "file_overwrite",
				path: artifactPath,
				existing: "modified since suspension",
				incoming: "expected unchanged",
				severity: "error",
				autoResolvable: false,
			});
		}
	}

	// ── State mismatch ───────────────────────────────────────────────
	const suspendedTaskList = extractTaskLikes(suspendedTasks);
	for (const task of suspendedTaskList) {
		const currentStatus = taskStatuses[task.id];
		if (currentStatus !== undefined && currentStatus !== task.status) {
			conflicts.push({
				kind: "state_mismatch",
				path: `tasks/${task.id}`,
				existing: currentStatus,
				incoming: task.status,
				severity: "error",
				autoResolvable: false,
			});
		}
	}

	return buildReport(conflicts);
}

// ── Conflict Resolution ────────────────────────────────────────────────

/**
 * Apply a resolution strategy to a conflict.
 *
 * - **skip**: skip the conflicting item (always resolves).
 * - **overwrite**: replace existing with incoming (resolves for `file_overwrite`
 *   and `schema_drift`; does not resolve `state_mismatch` or `resource_deleted`).
 * - **merge**: attempt merge — resolves `state_mismatch` with merged status;
 *   resolves others conditionally.
 */
export function resolveConflict(
	conflict: Conflict,
	strategy: ConflictStrategy,
): ConflictResolution {
	switch (strategy) {
		case "skip":
			return { resolved: true, action: `Skipped ${conflict.path}` };

		case "overwrite":
			if (conflict.kind === "file_overwrite" || conflict.kind === "schema_drift") {
				return { resolved: true, action: `Overwritten ${conflict.path} with incoming value` };
			}
			return {
				resolved: false,
				action: `Cannot overwrite ${conflict.kind} at ${conflict.path}; manual resolution required`,
			};

		case "merge":
			if (conflict.kind === "state_mismatch") {
				return {
					resolved: true,
					action: `Merged ${conflict.path}: kept existing=${conflict.existing ?? "?"}, incoming=${conflict.incoming ?? "?"}`,
				};
			}
			if (conflict.kind === "resource_deleted") {
				return {
					resolved: true,
					action: `Merged ${conflict.path}: using incoming resource reference`,
				};
			}
			if (conflict.kind === "file_overwrite") {
				return {
					resolved: true,
					action: `Merged ${conflict.path}: kept both versions`,
				};
			}
			if (conflict.kind === "schema_drift") {
				return {
					resolved: true,
					action: `Merged ${conflict.path}: using incoming schema version`,
				};
			}
			return {
				resolved: false,
				action: `Cannot merge ${conflict.kind} at ${conflict.path}`,
			};
	}
}
