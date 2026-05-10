export type { ExportContent, ExportAdapter, AdapterRegistry } from "./types.ts";
export { createAdapterRegistry, adapterRegistry } from "./registry.ts";
export { claudeAdapter } from "./claude-adapter.ts";
export { cursorAdapter } from "./cursor-adapter.ts";
export { codexAdapter } from "./codex-adapter.ts";
export { generateToolExport, resourcesToExportContent } from "./export-util.ts";

import { adapterRegistry } from "./registry.ts";
import { claudeAdapter } from "./claude-adapter.ts";
import { cursorAdapter } from "./cursor-adapter.ts";
import { codexAdapter } from "./codex-adapter.ts";

adapterRegistry.register(claudeAdapter);
adapterRegistry.register(cursorAdapter);
adapterRegistry.register(codexAdapter);
