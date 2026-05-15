const fs = require('fs');
let content = fs.readFileSync('src/ui/crew-widget.ts', 'utf8');
// Normalize line endings for search
const normalized = content.replace(/\r\n/g, '\n');

const oldStats = `function agentStats(agent: CrewAgentRecord, liveHandle?: LiveAgentHandle): string {
\tconst parts: string[] = [];
\tif (liveHandle) {
\t\tconst act = liveHandle.activity;
\t\tconst model = liveHandle.modelName;
\t\t// G3: Turn counter with limit
\t\tif (act.maxTurns != null) parts.push(\`\\u27F3\${act.turnCount}\\u2264\${act.maxTurns}\`);
\t\telse if (act.turnCount > 0) parts.push(\`\\u27F3\${act.turnCount}\`);
\t\tif (act.toolUses > 0) parts.push(\`\${act.toolUses} tool\${act.toolUses === 1 ? "" : "s"}\`);
\t\t// G4: Token + context % + compaction in one annotation
\t\tconst tokenAnnot: string[] = [];
\t\ttry {
\t\t\tconst stats = liveHandle.session.getSessionStats?.();
\t\t\tconst ctxPct = stats?.contextUsage?.percent;
\t\t\tif (ctxPct != null) {
\t\t\t\t// Note: color coding applied at render layer, not in widget string
\t\t\t\ttokenAnnot.push(\`\${Math.round(ctxPct)}%\`);
\t\t\t}
\t\t} catch { /* ignore */ }
\t\tif (act.compactionCount > 0) tokenAnnot.push(\`\\u21BB\${act.compactionCount}\`);
\t\tconst usage = getTaskUsage(liveHandle.taskId);
\t\tconst total = (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheWrite ?? 0);
\t\tif (total > 0) {
\t\t\tconst tokStr = formatTokensCompact(total);
\t\t\tif (tokenAnnot.length > 0) parts.push(\`\${tokStr} (\${tokenAnnot.join(" · ")})\`);
\t\t\telse parts.push(tokStr);
\t\t} else if (tokenAnnot.length > 0) {
\t\t\tparts.push(\`(\${tokenAnnot.join(" · ")})\`);
\t\t}
\t\t// R7: Duration with (running) suffix + model name
\t\tconst ms = (act.completedAtMs ?? Date.now()) - act.startedAtMs;
\t\tconst dur = \`\${(ms / 1000).toFixed(1)}s\`;
\t\tconst durPart = liveHandle.status === "running" ? \`\${dur} (running)\` : dur;
\t\tconst modelPart = model && model !== "default" ? \` · \${model}\` : "";
\t\tparts.push(durPart + modelPart);
\t} else {
\t\tif (agent.toolUses) parts.push(\`\${agent.toolUses} tool\${agent.toolUses === 1 ? "" : "s"}\`);
\t\tif (agent.progress?.tokens) parts.push(formatTokensCompact(agent.progress.tokens));
\t\tif (agent.progress?.turns) parts.push(\`\\u27F3\${agent.progress.turns}\`);
\t\tconst age = elapsed(agent.completedAt ?? agent.startedAt);
\t\tif (age) parts.push((agent.status === "running" || agent.status === "queued" || agent.status === "waiting") ? \`\${age} (running)\` : age);
\t}
\treturn parts.join(" · ");
}`;

const newStats = `function agentStats(agent: CrewAgentRecord, liveHandle?: LiveAgentHandle): string {
\tconst parts: string[] = [];
\tif (liveHandle) {
\t\tconst act = liveHandle.activity;
\t\tif (act.toolUses > 0) parts.push(\`\${act.toolUses} tools\`);
\t\tconst usage = getTaskUsage(liveHandle.taskId);
\t\tconst total = (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheWrite ?? 0);
\t\tif (total > 0) parts.push(formatTokensCompact(total));
\t\ttry {
\t\t\tconst stats = liveHandle.session.getSessionStats?.();
\t\t\tconst ctxPct = stats?.contextUsage?.percent;
\t\t\tif (ctxPct != null) parts.push(\`\${Math.round(ctxPct)}% ctx\`);
\t\t} catch { /* ignore */ }
\t\tconst ms = (act.completedAtMs ?? Date.now()) - act.startedAtMs;
\t\tparts.push(\`\${(ms / 1000).toFixed(1)}s\`);
\t} else {
\t\tif (agent.toolUses) parts.push(\`\${agent.toolUses} tools\`);
\t\tif (agent.progress?.tokens) parts.push(formatTokensCompact(agent.progress.tokens));
\t\tconst age = elapsed(agent.completedAt ?? agent.startedAt);
\t\tif (age) parts.push(age);
\t}
\treturn parts.join(" · ");
}`;

if (!normalized.includes(oldStats)) {
    console.error('ERROR: Could not find agentStats function');
    // Try to find it
    const idx = normalized.indexOf('function agentStats(');
    console.log('Function starts at index:', idx);
    if (idx >= 0) console.log('Next 50 chars:', JSON.stringify(normalized.slice(idx, idx + 50)));
    process.exit(1);
}
content = normalized.replace(oldStats, newStats);
// Write back with LF (git will normalize)
fs.writeFileSync('src/ui/crew-widget.ts', content);
console.log('Simplified agentStats');
