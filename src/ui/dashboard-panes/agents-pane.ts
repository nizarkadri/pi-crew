import type { RunDashboardOptions } from "../run-dashboard.ts";
import { iconForStatus } from "../status-colors.ts";
import type { RunUiSnapshot } from "../snapshot-types.ts";
import { spinnerFrame } from "../spinner.ts";
import { listLiveAgents, type LiveAgentHandle } from "../../runtime/live-agent-manager.ts";

const TOOL_LABELS: Record<string, string> = {
	read: "reading",
	bash: "cmd",
	edit: "editing",
	write: "writing",
	grep: "searching",
	find: "finding",
	ls: "listing",
};

function describeActivity(handle: LiveAgentHandle): string {
	const act = handle.activity;
	if (act.activeTools.size > 0) {
		const tools = [...new Set([...act.activeTools.values()])].map(t => TOOL_LABELS[t] ?? t);
		return tools.join(", ") + "…";
	}
	if (act.responseText?.trim()) {
		const line = act.responseText.split("\n").find((l) => l.trim())?.trim() ?? "";
		return line.length > 40 ? line.slice(0, 40) + "…" : line;
	}
	return "thinking…";
}

export function renderAgentsPane(snapshot: RunUiSnapshot | undefined, options: RunDashboardOptions = {}): string[] {
	if (!snapshot) return ["(snapshot unavailable)"];
	if (!snapshot.agents.length) return ["(no agents)"];
	const liveForRun = listLiveAgents().filter(h => h.runId === snapshot.runId);
	const { completed, total } = snapshot.progress;

	const lines: string[] = [];
	lines.push(`${completed}/${total} tasks done · ${snapshot.agents.length} agents`);

	for (const agent of snapshot.agents.slice(0, 12)) {
		const liveHandle = liveForRun.find(h => h.taskId === agent.taskId);
		const icon = iconForStatus(agent.status, { runningGlyph: spinnerFrame(agent.taskId) });
		const role = `${agent.role}`;

		// Compact activity line
		const activity = liveHandle ? describeActivity(liveHandle)
			: agent.progress?.currentTool ? `${TOOL_LABELS[agent.progress.currentTool] ?? agent.progress.currentTool}…`
			: agent.status === "running" ? "thinking…"
			: agent.status === "queued" ? "queued"
			: agent.status === "failed" ? (agent.error ?? "failed")
			: "done";

		// Stats: tokens + duration only
		const stats: string[] = [];
		const tokenTotal = (agent.usage?.input ?? 0) + (agent.usage?.output ?? 0) + (agent.usage?.cacheRead ?? 0) + (agent.usage?.cacheWrite ?? 0);
		if (tokenTotal > 0) {
			const tok = tokenTotal >= 1000 ? `${(tokenTotal / 1000).toFixed(1)}k` : `${tokenTotal}`;
			stats.push(tok);
		}
		if (liveHandle) {
			const ms = (liveHandle.activity.completedAtMs ?? Date.now()) - liveHandle.activity.startedAtMs;
			stats.push(`${(ms / 1000).toFixed(1)}s`);
			if (options.showModel !== false && liveHandle.modelName && liveHandle.modelName !== "default") {
				stats.push(liveHandle.modelName);
			}
		} else if (agent.startedAt) {
			const ms = Date.now() - new Date(agent.startedAt).getTime();
			if (Number.isFinite(ms)) stats.push(`${(ms / 1000).toFixed(1)}s`);
		}

		const statsStr = stats.length ? ` · ${stats.join(" ")}` : "";
		lines.push(`  ${icon} ${agent.taskId} ${role}${statsStr}`);
		lines.push(`    ${activity}`);
	}

	if (snapshot.agents.length > 12) {
		lines.push(`  … +${snapshot.agents.length - 12} more`);
	}

	return lines;
}
