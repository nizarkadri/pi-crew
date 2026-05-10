export interface ExportContent {
	id: string;
	name: string;
	description: string;
	category: string;
	tags: string[];
	body: string;
	source: { type: "agent" | "team" | "workflow" | "skill"; name: string };
}

export interface ExportAdapter {
	readonly toolId: string;
	readonly toolName: string;
	readonly fileExtension: string;
	getFilePath(content: ExportContent): string;
	formatFile(content: ExportContent): string;
}

export interface AdapterRegistry {
	get(toolId: string): ExportAdapter | undefined;
	getAll(): ExportAdapter[];
	register(adapter: ExportAdapter): void;
}
