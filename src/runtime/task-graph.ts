/**
 * DAG-based task execution order calculator.
 *
 * Uses Kahn's algorithm for topological sort and DFS for cycle detection.
 * Groups tasks into parallel "waves" where all tasks in wave N can run
 * concurrently and wave N+1 depends on at least one task in wave N.
 */

/** A lightweight node representation for the execution DAG. */
export interface TaskNode {
	id: string;
	dependsOn: string[];
	phase?: string;
}

/** A group of tasks that can all run in parallel. */
export interface ExecutionWave {
	index: number;
	taskIds: string[];
	label?: string;
}

/** The full execution plan produced by topological sort. */
export interface ExecutionPlan {
	waves: ExecutionWave[];
	hasCycle: boolean;
	cycleNodes?: string[];
}

/**
 * Build an execution plan from a flat list of task nodes using Kahn's algorithm.
 *
 * - Tasks with empty `dependsOn` go into wave 0.
 * - Each subsequent wave contains tasks whose dependencies are all in earlier waves.
 * - If all tasks have empty `dependsOn`, they all go into wave 0 (backward compatible).
 * - If a cycle is detected, `hasCycle` is true and `cycleNodes` lists the involved IDs.
 */
export function buildExecutionPlan(tasks: TaskNode[]): ExecutionPlan {
	if (tasks.length === 0) {
		return { waves: [], hasCycle: false };
	}

	const idSet = new Set<string>(tasks.map((t) => t.id));
	const adjacency = new Map<string, Set<string>>();       // id -> ids that depend on it
	const inDegree = new Map<string, number>();

	for (const task of tasks) {
		adjacency.set(task.id, new Set<string>());
		inDegree.set(task.id, 0);
	}

	for (const task of tasks) {
		let degree = 0;
		for (const dep of task.dependsOn) {
			if (!idSet.has(dep)) continue; // ignore unknown deps
			adjacency.get(dep)!.add(task.id);
			degree++;
		}
		inDegree.set(task.id, degree);
	}

	// Kahn's algorithm with wave grouping
	const waves: ExecutionWave[] = [];
	const assigned = new Set<string>();
	let currentWaveIds = tasks
		.filter((t) => inDegree.get(t.id) === 0)
		.map((t) => t.id);

	let waveIndex = 0;
	while (currentWaveIds.length > 0) {
		for (const id of currentWaveIds) assigned.add(id);

		const wave = buildWave(tasks, currentWaveIds, waveIndex);
		waves.push(wave);

		// Decrement in-degrees for dependents
		const nextWaveCandidates = new Set<string>();
		for (const id of currentWaveIds) {
			for (const dependent of adjacency.get(id) ?? []) {
				const current = inDegree.get(dependent)!;
				inDegree.set(dependent, current - 1);
				if (current - 1 === 0) nextWaveCandidates.add(dependent);
			}
		}

		currentWaveIds = [...nextWaveCandidates];
		waveIndex++;
	}

	// Detect cycle: if not all tasks were assigned, remaining ones form cycles
	if (assigned.size < tasks.length) {
		const cycleNodes = tasks
			.filter((t) => !assigned.has(t.id))
			.map((t) => t.id);
		return {
			waves,
			hasCycle: true,
			cycleNodes,
		};
	}

	return { waves, hasCycle: false };
}

/**
 * Derive the phase label for a wave. If all tasks in the wave share the same
 * `phase` value, use it as the wave label; otherwise leave it undefined.
 */
function buildWave(tasks: TaskNode[], ids: string[], index: number): ExecutionWave {
	const taskMap = new Map(tasks.map((t) => [t.id, t]));
	const waveTasks = ids.map((id) => taskMap.get(id)!).filter(Boolean);

	let label: string | undefined;
	if (waveTasks.length > 0 && waveTasks.every((t) => t.phase !== undefined)) {
		const phases = new Set(waveTasks.map((t) => t.phase));
		if (phases.size === 1) label = [...phases][0];
	}

	return { index, taskIds: ids, label };
}

/**
 * Return the IDs of tasks that are ready to run given a set of completed tasks.
 *
 * A task is "ready" when all its dependencies are in `completedTaskIds` AND
 * it has not already been completed itself. Returns tasks from the earliest
 * wave that still has uncompleted tasks.
 */
export function getReadyTasks(plan: ExecutionPlan, completedTaskIds: Set<string>): string[] {
	if (plan.hasCycle || plan.waves.length === 0) return [];

	const completed = completedTaskIds;

	for (const wave of plan.waves) {
		// All tasks in prior waves must be completed for this wave to be ready
		const priorWavesComplete = plan.waves
			.slice(0, wave.index)
			.every((w) => w.taskIds.every((id) => completed.has(id)));

		if (!priorWavesComplete) continue;

		// Filter to tasks not already completed
		const ready = wave.taskIds.filter((id) => !completed.has(id));
		if (ready.length > 0) return ready;
	}

	return [];
}

/**
 * Detect all cycles in the task graph using DFS.
 *
 * Returns an array of cycles, where each cycle is represented as an array of
 * task IDs forming a path from a node back to itself.
 */
export function detectCycles(tasks: TaskNode[]): string[][] {
	if (tasks.length === 0) return [];

	const idSet = new Set<string>(tasks.map((t) => t.id));
	const adjacency = new Map<string, string[]>();
	for (const task of tasks) {
		adjacency.set(
			task.id,
			task.dependsOn.filter((dep) => idSet.has(dep)),
		);
	}

	const WHITE = 0;
	const GRAY = 1;
	const BLACK = 2;

	const color = new Map<string, number>();
	for (const task of tasks) color.set(task.id, WHITE);

	const cycles: string[][] = [];
	const path: string[] = [];

	function dfs(nodeId: string): void {
		color.set(nodeId, GRAY);
		path.push(nodeId);

		const deps = adjacency.get(nodeId) ?? [];
		for (const dep of deps) {
			const depColor = color.get(dep);
			if (depColor === GRAY) {
				// Found a cycle: extract the path from dep to current node
				const cycleStart = path.indexOf(dep);
				if (cycleStart >= 0) {
					cycles.push(path.slice(cycleStart));
				}
			} else if (depColor === WHITE) {
				dfs(dep);
			}
		}

		path.pop();
		color.set(nodeId, BLACK);
	}

	for (const task of tasks) {
		if (color.get(task.id) === WHITE) {
			dfs(task.id);
		}
	}

	return cycles;
}
