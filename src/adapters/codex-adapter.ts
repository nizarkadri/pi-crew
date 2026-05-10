import type { ExportAdapter, ExportContent } from "./types.ts";

export const codexAdapter: ExportAdapter = {
	toolId: "codex",
	toolName: "Codex",
	fileExtension: ".md",

	getFilePath(_content: ExportContent): string {
		return "AGENTS.md";
	},

	formatFile(content: ExportContent): string {
		const tags = content.tags.length > 0 ? ` (${content.tags.join(", ")})` : "";
		return [
			`## ${content.name}${tags}\n`,
			`**Source:** ${content.source.type}/${content.source.name}  `,
			`**Category:** ${content.category}\n`,
			content.body,
		].join("\n");
	},
};
