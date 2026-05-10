import type { AdapterRegistry, ExportAdapter } from "./types.ts";

export function createAdapterRegistry(): AdapterRegistry {
	const adapters = new Map<string, ExportAdapter>();
	return {
		get(toolId: string): ExportAdapter | undefined {
			return adapters.get(toolId);
		},
		getAll(): ExportAdapter[] {
			return [...adapters.values()];
		},
		register(adapter: ExportAdapter): void {
			adapters.set(adapter.toolId, adapter);
		},
	};
}

export const adapterRegistry: AdapterRegistry = createAdapterRegistry();
