import type { ExportAdapter, ExportContent } from "./types.ts";

export const claudeAdapter: ExportAdapter = {
	toolId: "claude",
	toolName: "Claude Code",
	fileExtension: ".md",

	getFilePath(content: ExportContent): string {
		return `.claude/commands/pi-crew/${content.id}.md`;
	},

	formatFile(content: ExportContent): string {
		const tagLines = content.tags.length > 0
			? ["tags:", ...content.tags.map((tag) => `  - ${JSON.stringify(tag)}`)]
			: [];
		const frontmatter = [
			"---",
			`description: ${JSON.stringify(content.description)}`,
			`category: ${JSON.stringify(content.category)}`,
			...tagLines,
			"---",
		].join("\n");
		return `${frontmatter}\n\n# ${content.name}\n\n${content.body}\n`;
	},
};
