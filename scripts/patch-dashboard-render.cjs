const fs = require('fs');
let content = fs.readFileSync('src/ui/run-dashboard.ts', 'utf8');
const normalized = content.replace(/\r\n/g, '\n');

// Find and replace the renderUnsafe method
const startMarker = '\tprivate renderUnsafe(width: number): string[] {';
const startIdx = normalized.indexOf(startMarker);
if (startIdx < 0) { console.error('Cannot find renderUnsafe'); process.exit(1); }

// Find the matching closing brace — count braces
let braceCount = 0;
let endIdx = -1;
for (let i = startIdx; i < normalized.length; i++) {
    if (normalized[i] === '{') braceCount++;
    if (normalized[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
            endIdx = i + 1;
            break;
        }
    }
}
if (endIdx < 0) { console.error('Cannot find end of renderUnsafe'); process.exit(1); }

const oldMethod = normalized.slice(startIdx, endIdx);

const newMethod = `\tprivate renderUnsafe(width: number): string[] {
\t\tthis.refreshRuns();
\t\tconst signature = this.buildSignature();
\t\tif (signature !== this.cachedVersion || this.cachedWidth !== width) {
\t\t\tconst innerWidth = Math.max(20, width - 4);
\t\t\tconst borderWidth = Math.min(innerWidth, Math.max(0, width - 2));
\t\t\tconst fg = (color: Parameters<CrewTheme["fg"]>[0], text: string) => this.theme.fg(color, text);
\t\t\tconst borderFill = (count: number) => new DynamicCrewBorder(this.theme).render(count)[0];
\t\t\tconst border = (left: string, right: string) => \`\${fg("border", left)}\${borderFill(borderWidth)}\${fg("border", right)}\`;
\t\t\tconst row = (text: string) => \`│ \${pad(truncate(text, innerWidth - 1), innerWidth - 1)}│\`;
\t\t\tconst sep = () => border("├", "┤");
\t\t\t
\t\t\tconst lines: string[] = [
\t\t\t\tborder("╭", "╮"),
\t\t\t\trow(\`\${fg("accent", "▐")} \${this.theme.bold(this.options.placement === "right" ? "pi-crew sidebar" : "pi-crew dashboard")}\`),
\t\t\t\trow(\`Runs: \${this.runs.length} · \${countByStatus(this.runs, this.options.snapshotCache)}  ·  1-6 panes · ↑↓ nav · Esc close\`),
\t\t\t\tsep(),
\t\t\t];

\t\t\tif (this.runs.length === 0) {
\t\t\t\tlines.push(row("No runs found."));
\t\t\t} else {
\t\t\t\t// Run list
\t\t\t\tconst rows = groupedRuns(this.runs, this.options.snapshotCache).slice(0, 16);
\t\t\t\tconst selectableRuns = rows.filter((r) => r.run);
\t\t\t\tfor (const row_ of rows) {
\t\t\t\t\tif (!row_.run) {
\t\t\t\t\t\tlines.push(row(fg("dim", \`── \${row_.label} ──\`)));
\t\t\t\t\t\tcontinue;
\t\t\t\t\t}
\t\t\t\t\tconst index = selectableRuns.findIndex((c) => c.run?.runId === row_.run?.runId);
\t\t\t\t\tconst rowSnap = snapshotFor(row_.run, this.options.snapshotCache);
\t\t\t\t\tconst rowRun = rowSnap?.manifest ?? row_.run;
\t\t\t\t\tconst rowAgents = rowSnap?.agents ?? agentsFor(row_.run, this.options.snapshotCache);
\t\t\t\t\tconst rowStatus: RunStatus = isLikelyOrphanedActiveRun(rowRun, rowAgents) ? "stale" : (rowRun.status as RunStatus);
\t\t\t\t\tconst label = runLabel(rowRun, index === this.selected, this.options.snapshotCache);
\t\t\t\t\tlines.push(row(applyStatusColor(this.theme, rowStatus, label)));
\t\t\t\t}

\t\t\t\t// Selected run detail
\t\t\t\tconst selectedRun = selectedRunFromGrouped(this.runs, this.selected, this.options.snapshotCache);
\t\t\t\tif (selectedRun) {
\t\t\t\t\tconst snap = snapshotFor(selectedRun, this.options.snapshotCache);
\t\t\t\t\tconst r = snap?.manifest ?? selectedRun;
\t\t\t\t\tconst agents = snap?.agents ?? agentsFor(selectedRun, this.options.snapshotCache);
\t\t\t\t\tlines.push(sep());
\t\t\t\t\t
\t\t\t\t\t// Compact run header
\t\t\t\t\tconst statusStr = isLikelyOrphanedActiveRun(r, agents) ? "stale" : r.status;
\t\t\t\t\tconst teamStr = \`\${r.team}/\${r.workflow ?? "default"}\`;
\t\t\t\t\tlines.push(row(\`\${fg("accent", "▸")} \${r.runId.slice(-12)} · \${statusStr} · \${teamStr}\`));
\t\t\t\t\tlines.push(row(fg("dim", \`  \${r.goal.slice(0, innerWidth - 10)}\`)));

\t\t\t\t\t// Pane header
\t\t\t\t\tconst paneNames: Record<string, string> = { agents: "Agents", progress: "Progress", mailbox: "Mailbox", output: "Output", health: "Health", metrics: "Metrics" };
\t\t\t\t\tlines.push(row(fg("dim", \`── \${paneNames[this.activePane] ?? this.activePane} ──\`)));

\t\t\t\t\t// Pane content
\t\t\t\t\tconst paneLines = snap
\t\t\t\t\t\t? this.activePane === "agents"
\t\t\t\t\t\t\t? renderAgentsPane(snap, this.options)
\t\t\t\t\t\t\t: this.activePane === "progress"
\t\t\t\t\t\t\t\t? renderProgressPane(snap)
\t\t\t\t\t\t\t\t: this.activePane === "mailbox"
\t\t\t\t\t\t\t\t\t? renderMailboxPane(snap)
\t\t\t\t\t\t\t\t\t: this.activePane === "health"
\t\t\t\t\t\t\t\t\t\t? renderHealthPane(snap, { isForeground: !r.async })
\t\t\t\t\t\t\t\t\t\t: this.activePane === "metrics"
\t\t\t\t\t\t\t\t\t\t\t? renderMetricsPane(snap, { registry: this.options.registry })
\t\t\t\t\t\t\t\t\t\t\t: renderTranscriptPane(snap)
\t\t\t\t\t\t: [
\t\t\t\t\t\t...readAgentPreview(r, this.showFullProgress ? 20 : 6, this.options),
\t\t\t\t\t\t...readProgressPreview(r, this.showFullProgress ? 20 : 3),
\t\t\t\t\t];
\t\t\t\t\tfor (const line of paneLines.slice(0, 20)) {
\t\t\t\t\t\tlines.push(row(truncate(line, innerWidth - 2)));
\t\t\t\t\t}

\t\t\t\t\t// Footer
\t\t\t\t\tconst selectedTasks = snap?.tasks ?? readRunTasks(r, this.options.snapshotCache);
\t\t\t\t\tlet contextPercent: number | undefined;
\t\t\t\t\tfor (const agent of agents) {
\t\t\t\t\t\tif (agent.status === "running" && agent.runtime === "live-session") {
\t\t\t\t\t\t\tconst pct = getLiveAgentContextPercent(agent.taskId);
\t\t\t\t\t\t\tif (pct != null) { contextPercent = pct; break; }
\t\t\t\t\t\t}
\t\t\t\t\t}
\t\t\t\t\tconst footer = new CrewFooter({
\t\t\t\t\t\tpwd: r.cwd,
\t\t\t\t\t\trunId: r.runId,
\t\t\t\t\t\tstatus: isLikelyOrphanedActiveRun(r, agents) ? "stale" : r.status,
\t\t\t\t\t\tusage: aggregateUsage(selectedTasks),
\t\t\t\t\t\tcontextPercent,
\t\t\t\t\t\tbadges: [\`team \${r.team}\`, \`\${r.artifacts.length} artifacts\`, r.workspaceMode].filter(Boolean),
\t\t\t\t\t}, this.theme);
\t\t\t\t\tlines.push(sep());
\t\t\t\t\tfor (const footerLine of footer.render(innerWidth - 1)) {
\t\t\t\t\t\tlines.push(row(truncate(footerLine, innerWidth - 1)));
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t\tlines.push(border("╰", "╯"));
\t\t\tthis.cachedLines = renderLines(lines.map((line) => truncate(line, width)), width);
\t\t\tthis.cachedVersion = signature;
\t\t\tthis.cachedWidth = width;
\t\t}
\t\treturn this.cachedLines;
\t}`;

content = normalized.slice(0, startIdx) + newMethod + normalized.slice(endIdx);
fs.writeFileSync('src/ui/run-dashboard.ts', content);
console.log('Rewrote dashboard renderUnsafe');
