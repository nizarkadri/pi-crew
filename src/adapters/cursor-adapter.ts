import type { ExportAdapter, ExportContent } from "./types.ts";

export const cursorAdapter: ExportAdapter = {
	toolId: "cursor",
	toolName: "Cursor",
	fileExtension: ".md",

	getFilePath(content: ExportContent): string {
		return `.cursor/rules/pi-crew-${content.id}.md`;
	},

	formatFile(content: ExportContent): string {
		const header = `# ${content.name}\n\n> ${content.description}`;
		const tags = content.tags.length > 0 ? `\n\n**Tags:** ${content.tags.join(", ")}` : "";
		return `${header}${tags}\n\n${content.body}\n`;
	},
};
