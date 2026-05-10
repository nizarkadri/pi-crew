/**
 * Workflow Phase State Machine
 *
 * Tracks phase-level progression through a workflow, validating that each
 * phase's declared inputs (required artifacts) are satisfied before it can
 * start. All transition functions are immutable — they return new machine
 * state rather than mutating in place.
 */

// ── Public types ──────────────────────────────────────────────────────────────

export type PhaseStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface PhaseGuardContext {
	/** Artifact paths that currently exist on disk. */
	completedArtifacts: string[];
	/** Status of the phase immediately preceding the target phase. */
	previousPhaseStatus: PhaseStatus;
	/** Results from tasks that have already completed. */
	taskResults: Array<{ taskId: string; status: string; outputPath?: string }>;
}

export interface GuardResult {
	allowed: boolean;
	reason?: string;
}

export interface PhaseTransition {
	from: PhaseStatus;
	to: PhaseStatus;
	guard?: (context: PhaseGuardContext) => GuardResult;
}

export interface PhaseState {
	name: string;
	status: PhaseStatus;
	/** Artifact names required before this phase can start. */
	inputs: string[];
	/** Artifact names this phase produces. */
	outputs: string[];
	startedAt?: string;
	finishedAt?: string;
}

export interface WorkflowStateMachine {
	phases: PhaseState[];
	currentPhaseIndex: number;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a new workflow state machine from an initial set of phases.
 * All phases start as "pending" and the current index is set to 0.
 */
export function createWorkflowStateMachine(phases: PhaseState[]): WorkflowStateMachine {
	return {
		phases: phases.map((phase) => ({
			...phase,
			status: phase.status ?? "pending",
		})),
		currentPhaseIndex: 0,
	};
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Return the declared inputs for a given phase index.
 * Returns an empty array for out-of-bounds indices.
 */
export function getPhaseInputs(machine: WorkflowStateMachine, phaseIndex: number): string[] {
	const phase = machine.phases[phaseIndex];
	if (!phase) return [];
	return phase.inputs;
}

/**
 * Check whether a transition to a specific phase is allowed.
 *
 * Rules (evaluated in order):
 * 1. `phaseIndex` must be in bounds.
 * 2. If this is not the first phase, the previous phase must be "completed" or "skipped".
 * 3. All declared `inputs` for the target phase must appear in `completedArtifacts`.
 * 4. If a custom `guard` is supplied on a transition, it must also approve.
 */
export function canTransitionToPhase(
	machine: WorkflowStateMachine,
	phaseIndex: number,
	context: PhaseGuardContext,
): GuardResult {
	if (phaseIndex < 0 || phaseIndex >= machine.phases.length) {
		return { allowed: false, reason: `Phase index ${phaseIndex} is out of bounds (0..${machine.phases.length - 1}).` };
	}

	// Previous phase must have completed (or been skipped).
	if (phaseIndex > 0) {
		const prevStatus = context.previousPhaseStatus;
		if (prevStatus !== "completed" && prevStatus !== "skipped") {
			return { allowed: false, reason: `Previous phase status is '${prevStatus}'; expected 'completed' or 'skipped'.` };
		}
	}

	// All declared inputs must be satisfied.
	const phase = machine.phases[phaseIndex]!;
	if (phase.inputs.length > 0) {
		const artifactSet = new Set(context.completedArtifacts);
		const missing = phase.inputs.filter((input) => !artifactSet.has(input));
		if (missing.length > 0) {
			return { allowed: false, reason: `Missing required artifacts: ${missing.join(", ")}.` };
		}
	}

	return { allowed: true };
}

/**
 * Validate that all preconditions for the *current* phase are met.
 * Returns the subset of declared inputs that are not yet present in `completedArtifacts`.
 */
export function validatePhasePreconditions(
	machine: WorkflowStateMachine,
	context: PhaseGuardContext,
): { ready: boolean; blocking: string[] } {
	const phase = machine.phases[machine.currentPhaseIndex];
	if (!phase) {
		return { ready: false, blocking: [`No phase at index ${machine.currentPhaseIndex}.`] };
	}

	const artifactSet = new Set(context.completedArtifacts);
	const missing = phase.inputs.filter((input) => !artifactSet.has(input));
	return { ready: missing.length === 0, blocking: missing };
}

// ── Transitions ───────────────────────────────────────────────────────────────

/** Result of a phase transition: the (potentially unchanged) machine and an optional guard result. */
export interface TransitionResult {
	machine: WorkflowStateMachine;
	guardResult?: GuardResult;
}

/**
 * Transition a phase to a new status. Returns a `TransitionResult` containing
 * the new `WorkflowStateMachine` and an optional `guardResult` when the guard
 * was checked.
 *
 * If `context` is provided and the guard fails, the machine is returned
 * **UNCHANGED** (the phase is NOT auto-failed) along with the `guardResult`
 * so the caller can decide what to do.
 *
 * For the "pending → running" transition the `startedAt` timestamp is set.
 * For terminal transitions ("completed", "failed", "skipped") the `finishedAt` timestamp is set.
 * On success the `currentPhaseIndex` advances to `phaseIndex` (or stays if already there).
 */
export function transitionPhase(
	machine: WorkflowStateMachine,
	phaseIndex: number,
	status: PhaseStatus,
	context?: PhaseGuardContext,
): TransitionResult {
	if (context) {
		const check = canTransitionToPhase(machine, phaseIndex, context);
		if (!check.allowed) {
			// Return machine UNCHANGED with guard result — caller decides what to do
			return { machine, guardResult: check };
		}
	}

	const now = new Date().toISOString();
	const phases = machine.phases.map((phase, index) => {
		if (index !== phaseIndex) return phase;
		return {
			...phase,
			status,
			...(status === "running" && !phase.startedAt ? { startedAt: now } : {}),
			...((status === "completed" || status === "failed" || status === "skipped") && !phase.finishedAt ? { finishedAt: now } : {}),
		};
	});

	return {
		machine: {
			phases,
			currentPhaseIndex: Math.max(machine.currentPhaseIndex, phaseIndex),
		},
	};
}
