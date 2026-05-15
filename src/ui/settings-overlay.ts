/**
 * Interactive TUI Settings Overlay for pi-crew.
 * Renders a tabbed settings list with inline editing, similar to Pi's /settings.
 */
import type { CrewTheme } from "./theme-adapter.ts";
import { truncate } from "../utils/visual.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SettingType = "boolean" | "enum" | "number" | "string" | "agent";

export interface SettingDef {
	id: string;
	label: string;
	description?: string;
	type: SettingType;
	/** For enum: list of allowed values */
	values?: string[];
	/** Tab grouping */
	tab: string;
}

export interface SettingsOverlayCallbacks {
	onChange: (id: string, value: unknown) => void;
	onClose: () => void;
}

interface TabDef {
	id: string;
	label: string;
	icon: string;
}

// ---------------------------------------------------------------------------
// Setting Definitions — mirrors config schema
// ---------------------------------------------------------------------------

const TABS: TabDef[] = [
	{ id: "runtime", label: "Runtime", icon: "⚙" },
	{ id: "limits", label: "Limits", icon: "📐" },
	{ id: "agents", label: "Agents", icon: "🤖" },
	{ id: "ui", label: "UI", icon: "🖥" },
	{ id: "autonomous", label: "Auto", icon: "🚀" },
	{ id: "advanced", label: "Advanced", icon: "🔧" },
];

const SETTINGS: SettingDef[] = [
	// Runtime
	{ id: "runtime.mode", label: "Runtime Mode", type: "enum", values: ["auto", "scaffold", "child-process", "live-session"], tab: "runtime", description: "How workers execute. 'auto' picks best available. 'scaffold' = dry-run." },
	{ id: "runtime.maxTurns", label: "Max Turns", type: "number", tab: "runtime", description: "Maximum agent turns per task." },
	{ id: "runtime.graceTurns", label: "Grace Turns", type: "number", tab: "runtime", description: "Extra turns allowed after completion." },
	{ id: "runtime.inheritContext", label: "Inherit Context", type: "boolean", tab: "runtime", description: "Pass parent conversation context to workers." },
	{ id: "runtime.promptMode", label: "Prompt Mode", type: "enum", values: ["compact", "full", "minimal"], tab: "runtime", description: "How much prompt detail to send to workers." },
	{ id: "runtime.completionMutationGuard", label: "Mutation Guard", type: "enum", values: ["off", "warn", "block"], tab: "runtime", description: "Guard against tasks completing without file mutations." },
	{ id: "runtime.isolationPolicy", label: "Isolation Policy", type: "enum", values: ["workspace", "none"], tab: "runtime", description: "Workspace isolation between agents." },
	// Limits
	{ id: "limits.maxConcurrentWorkers", label: "Max Concurrent", type: "number", tab: "limits", description: "Max number of workers running simultaneously." },
	{ id: "limits.maxTaskDepth", label: "Max Task Depth", type: "number", tab: "limits", description: "Maximum depth of nested task spawning." },
	{ id: "limits.maxRunMinutes", label: "Max Run Minutes", type: "number", tab: "limits", description: "Maximum total run time in minutes." },
	{ id: "limits.maxRetriesPerTask", label: "Max Retries", type: "number", tab: "limits", description: "Max retry attempts per failed task." },
	{ id: "limits.maxTasksPerRun", label: "Max Tasks", type: "number", tab: "limits", description: "Maximum number of tasks per run." },
	{ id: "limits.heartbeatStaleMs", label: "Heartbeat Stale", type: "number", tab: "limits", description: "Milliseconds before a worker is considered stale." },
	// Agents
	{ id: "agents.overrides", label: "Agent Model Overrides", type: "agent", tab: "agents", description: "Model and thinking overrides per agent role." },
	{ id: "agents.disableBuiltins", label: "Disable Builtins", type: "boolean", tab: "agents", description: "Disable built-in agent definitions." },
	// UI
	{ id: "ui.showModel", label: "Show Model", type: "boolean", tab: "ui", description: "Show model name in widget/dashboard." },
	{ id: "ui.showTokens", label: "Show Tokens", type: "boolean", tab: "ui", description: "Show token counts in dashboard." },
	{ id: "ui.showTools", label: "Show Tools", type: "boolean", tab: "ui", description: "Show tool usage in dashboard." },
	{ id: "ui.dashboardPlacement", label: "Dashboard Placement", type: "enum", values: ["center", "right"], tab: "ui", description: "Where to place the dashboard overlay." },
	{ id: "ui.dashboardWidth", label: "Dashboard Width", type: "number", tab: "ui", description: "Dashboard width as percentage or pixels." },
	{ id: "ui.autoOpenDashboard", label: "Auto Open Dashboard", type: "boolean", tab: "ui", description: "Auto-open dashboard when a run starts." },
	{ id: "ui.widgetPlacement", label: "Widget Placement", type: "enum", values: ["bottom", "hidden"], tab: "ui", description: "Where to place the crew widget." },
	// Autonomous
	{ id: "autonomous.enabled", label: "Enabled", type: "boolean", tab: "autonomous", description: "Enable autonomous pi-crew delegation." },
	{ id: "autonomous.injectPolicy", label: "Inject Policy", type: "boolean", tab: "autonomous", description: "Inject delegation policy into agent context." },
	{ id: "autonomous.preferAsyncForLongTasks", label: "Prefer Async", type: "boolean", tab: "autonomous", description: "Prefer async execution for long tasks." },
	{ id: "autonomous.allowWorktreeSuggestion", label: "Allow Worktree", type: "boolean", tab: "autonomous", description: "Allow suggesting worktree isolation." },
	// Advanced
	{ id: "executeWorkers", label: "Execute Workers", type: "boolean", tab: "advanced", description: "Allow real child Pi workers. false = scaffold only." },
	{ id: "asyncByDefault", label: "Async By Default", type: "boolean", tab: "advanced", description: "Run teams asynchronously by default." },
	{ id: "notifierIntervalMs", label: "Notifier Interval", type: "number", tab: "advanced", description: "Async run notifier check interval in ms." },
	{ id: "reliability.autoRetry", label: "Auto Retry", type: "boolean", tab: "advanced", description: "Automatically retry failed tasks." },
	{ id: "reliability.autoRecover", label: "Auto Recover", type: "boolean", tab: "advanced", description: "Automatically recover from crashes." },
	{ id: "telemetry.enabled", label: "Telemetry", type: "boolean", tab: "advanced", description: "Enable telemetry collection." },
	{ id: "notifications.enabled", label: "Notifications", type: "boolean", tab: "advanced", description: "Enable run notifications." },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(value: unknown): string {
	if (value === undefined || value === null) return "<default>";
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") return String(value);
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
	const keys = path.split(".");
	let current: unknown = obj;
	for (const key of keys) {
		if (!current || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
	const keys = path.split(".");
	let target: Record<string, unknown> = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		if (!target[keys[i]] || typeof target[keys[i]] !== "object") {
			target[keys[i]] = {};
		}
		target = target[keys[i]] as Record<string, unknown>;
	}
	target[keys[keys.length - 1]] = value;
}

// ---------------------------------------------------------------------------
// Submenu: Select from list
// ---------------------------------------------------------------------------

class SelectSubmenu {
	private selectedIndex = 0;
	private readonly items: string[];
	private readonly theme: CrewTheme;
	private readonly onSelect: (value: string) => void;
	private readonly onCancel: () => void;
	private readonly title: string;

	constructor(title: string, options: string[], current: string, theme: CrewTheme, onSelect: (value: string) => void, onCancel: () => void) {
		this.title = title;
		this.items = options;
		this.theme = theme;
		this.onSelect = onSelect;
		this.onCancel = onCancel;
		this.selectedIndex = options.indexOf(current);
		if (this.selectedIndex < 0) this.selectedIndex = 0;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const lines: string[] = [];
		lines.push(this.theme.bold(this.theme.fg("accent", `  ${this.title}`)));
		lines.push("");
		for (const [i, item] of this.items.entries()) {
			const isSelected = i === this.selectedIndex;
			const prefix = isSelected ? " → " : "   ";
			const line = `${prefix}${item}`;
			lines.push(isSelected ? (this.theme.inverse?.(line) ?? line) : line);
		}
		lines.push("");
		lines.push(this.theme.fg("dim", "  Enter to select · Esc to go back"));
		return lines;
	}

	handleInput(data: string): void {
		if (data === "\x1b" || data === "q") {
			this.onCancel();
			return;
		}
		if (data === "\x1b[A" || data === "k") {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			return;
		}
		if (data === "\x1b[B" || data === "j") {
			this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
			return;
		}
		if (data === "\r" || data === "\n") {
			this.onSelect(this.items[this.selectedIndex]!);
		}
	}
}

// ---------------------------------------------------------------------------
// Submenu: Text input
// ---------------------------------------------------------------------------

class TextinputSubmenu {
	private value: string;
	private readonly theme: CrewTheme;
	private readonly onSubmit: (value: string) => void;
	private readonly onCancel: () => void;
	private readonly title: string;
	private readonly description: string;

	constructor(title: string, description: string, current: string, theme: CrewTheme, onSubmit: (value: string) => void, onCancel: () => void) {
		this.title = title;
		this.description = description;
		this.value = current;
		this.theme = theme;
		this.onSubmit = onSubmit;
		this.onCancel = onCancel;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const lines: string[] = [];
		lines.push(this.theme.bold(this.theme.fg("accent", `  ${this.title}`)));
		if (this.description) {
			lines.push(this.theme.fg("muted", `  ${this.description}`));
		}
		lines.push("");
		lines.push(`  ${this.value}▌`);
		lines.push("");
		lines.push(this.theme.fg("dim", "  Enter to save · Esc to cancel · Clear to unset"));
		return lines;
	}

	handleInput(data: string): void {
		if (data === "\x1b" || data === "q") {
			this.onCancel();
			return;
		}
		if (data === "\r" || data === "\n") {
			this.onSubmit(this.value);
			return;
		}
		if (data === "\x7f" || data === "\b") {
			this.value = this.value.slice(0, -1);
			return;
		}
		// Ctrl+C
		if (data === "\x03") {
			this.value = "";
			return;
		}
		// Regular character (ignore escape sequences)
		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.value += data;
		}
	}
}

// ---------------------------------------------------------------------------
// Submenu: Agent overrides editor
// ---------------------------------------------------------------------------

const AGENT_ROLES = ["explorer", "planner", "analyst", "critic", "executor", "reviewer", "security-reviewer", "test-engineer", "verifier", "writer"];

class AgentOverridesSubmenu {
	private readonly config: Record<string, unknown>;
	private readonly theme: CrewTheme;
	private readonly onSave: (overrides: Record<string, unknown>) => void;
	private readonly onCancel: () => void;
	private selectedIndex = 0;
	private editingField: { role: string; field: "model" | "thinking" } | null = null;
	private editValue = "";

	constructor(config: Record<string, unknown>, theme: CrewTheme, onSave: (overrides: Record<string, unknown>) => void, onCancel: () => void) {
		this.config = config;
		this.theme = theme;
		this.onSave = onSave;
		this.onCancel = onCancel;
	}

	invalidate(): void {}

	render(width: number): string[] {
		if (this.editingField) {
			return this.renderEdit(width);
		}
		return this.renderList(width);
	}

	private renderList(width: number): string[] {
		const lines: string[] = [];
		lines.push(this.theme.bold(this.theme.fg("accent", "  Agent Model Overrides")));
		lines.push("");
		const overrides = (this.config as Record<string, unknown>).agents && typeof (this.config as Record<string, unknown>).agents === "object"
			? ((this.config as Record<string, unknown>).agents as Record<string, unknown>).overrides as Record<string, Record<string, unknown>> | undefined
			: undefined;

		for (const [i, role] of AGENT_ROLES.entries()) {
			const agent = overrides?.[role];
			const model = typeof agent?.model === "string" ? agent.model : "<default>";
			const thinking = typeof agent?.thinking === "string" ? agent.thinking : "<default>";
			const isSelected = i === this.selectedIndex;
			const prefix = isSelected ? " → " : "   ";
			const line = `${prefix}${role.padEnd(20)} ${model.padEnd(25)} thinking=${thinking}`;
			lines.push(truncate(line, width, isSelected ? "…" : undefined));
		}
		lines.push("");
		lines.push(this.theme.fg("dim", "  Enter to edit · Esc to go back"));
		return lines;
	}

	private renderEdit(width: number): string[] {
		const lines: string[] = [];
		const field = this.editingField!;
		lines.push(this.theme.bold(this.theme.fg("accent", `  Edit ${field.role} ${field.field}`)));
		lines.push("");
		if (field.field === "thinking") {
			lines.push("  Options: off, low, medium, high");
		} else {
			lines.push("  Example: zai/glm-5.1, minimax/minimax-m2.7");
		}
		lines.push("");
		lines.push(`  ${this.editValue}▌`);
		lines.push("");
		lines.push(this.theme.fg("dim", "  Enter to save · Esc to cancel · Clear to reset"));
		return lines;
	}

	handleInput(data: string): void {
		if (this.editingField) {
			this.handleEditInput(data);
			return;
		}

		if (data === "\x1b" || data === "q") {
			this.onCancel();
			return;
		}
		if (data === "\x1b[A" || data === "k") {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			return;
		}
		if (data === "\x1b[B" || data === "j") {
			this.selectedIndex = Math.min(AGENT_ROLES.length - 1, this.selectedIndex + 1);
			return;
		}
		if (data === "\r" || data === "\n") {
			const role = AGENT_ROLES[this.selectedIndex]!;
			// First Enter = edit model, we'll open model edit
			this.editingField = { role, field: "model" };
			const overrides = this.getOverrides();
			const agent = overrides[role] as Record<string, unknown> | undefined;
			this.editValue = typeof agent?.model === "string" ? agent.model : "";
		}
	}

	private handleEditInput(data: string): void {
		if (data === "\x1b") {
			this.editingField = null;
			return;
		}
		if (data === "\r" || data === "\n") {
			const field = this.editingField!;
			const overrides = this.getOverrides();
			if (this.editValue === "") {
				// Unset
				const agent = overrides[field.role] as Record<string, unknown> | undefined;
				if (agent) delete agent[field.field];
			} else {
				if (!overrides[field.role]) overrides[field.role] = {};
				(overrides[field.role] as Record<string, unknown>)[field.field] = this.editValue;
			}

			// If we just saved model, now edit thinking
			if (field.field === "model") {
				this.editingField = { role: field.role, field: "thinking" };
				const agent = overrides[field.role] as Record<string, unknown> | undefined;
				this.editValue = typeof agent?.thinking === "string" ? agent.thinking : "";
			} else {
				// Done editing this agent
				this.onSave(overrides);
				this.editingField = null;
			}
			return;
		}
		if (data === "\x7f" || data === "\b") {
			this.editValue = this.editValue.slice(0, -1);
			return;
		}
		if (data === "\x03") {
			this.editValue = "";
			return;
		}
		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.editValue += data;
		}
	}

	private getOverrides(): Record<string, unknown> {
		const agents = (this.config as Record<string, unknown>).agents;
		if (!agents || typeof agents !== "object") return {};
		const overrides = (agents as Record<string, unknown>).overrides;
		if (!overrides || typeof overrides !== "object") return {};
		return JSON.parse(JSON.stringify(overrides)) as Record<string, unknown>;
	}
}

// ---------------------------------------------------------------------------
// Main Settings Overlay
// ---------------------------------------------------------------------------

export class SettingsOverlay {
	private readonly theme: CrewTheme;
	private readonly callbacks: SettingsOverlayCallbacks;
	private readonly config: Record<string, unknown>;

	private currentTabIndex = 0;
	private selectedIndex = 0;
	private scrollOffset = 0;
	private maxVisible = 12;

	// Submenu state
	private submenu: SelectSubmenu | TextinputSubmenu | AgentOverridesSubmenu | null = null;
	private submenuSettingId: string | null = null;

	// Changed values (for display refresh)
	private changedValues = new Map<string, unknown>();

	constructor(
		config: Record<string, unknown>,
		theme: CrewTheme,
		callbacks: SettingsOverlayCallbacks,
	) {
		this.config = config;
		this.theme = theme;
		this.callbacks = callbacks;
	}

	invalidate(): void {
		this.submenu?.invalidate();
	}

	render(width: number): string[] {
		const lines: string[] = [];
		// Header
		lines.push(this.theme.bold(this.theme.fg("accent", "  pi-crew Settings")));
		lines.push(this.renderTabBar(width));
		lines.push("─".repeat(Math.min(width - 2, 70)));

		if (this.submenu) {
			lines.push(...this.submenu.render(width));
			return lines;
		}

		const tabId = TABS[this.currentTabIndex]?.id ?? "runtime";
		const settings = SETTINGS.filter(s => s.tab === tabId);

		if (settings.length === 0) {
			lines.push(this.theme.fg("muted", "  No settings in this tab."));
		} else {
			const visibleStart = this.scrollOffset;
			const visibleEnd = Math.min(this.scrollOffset + this.maxVisible, settings.length);
			for (let i = visibleStart; i < visibleEnd; i++) {
				const def = settings[i]!;
				const effective = this.changedValues.has(def.id) ? this.changedValues.get(def.id) : getNestedValue(this.config, def.id);
				const valueStr = formatValue(effective);
				const isSelected = i === this.selectedIndex;
				const prefix = isSelected ? " → " : "   ";
				const label = def.label.padEnd(24);
				const line = `${prefix}${label} ${valueStr}`;
				lines.push(truncate(isSelected ? (this.theme.inverse?.(line) ?? line) : line, width));
			}

			if (this.scrollOffset + this.maxVisible < settings.length) {
				const remaining = settings.length - this.scrollOffset - this.maxVisible;
				lines.push(this.theme.fg("dim", `  … +${remaining} more`));
			}
		}

		// Description of selected setting
		lines.push("");
		const selectedDef = settings[this.selectedIndex];
		if (selectedDef?.description) {
			lines.push(this.theme.fg("muted", `  ${selectedDef.description}`));
		}

		// Hints
		lines.push("");
		lines.push(this.theme.fg("dim", "  ↑↓ Navigate · Enter/Edit · Tab Switch · Esc Close"));

		return lines;
	}

	private renderTabBar(width: number): string {
		const parts: string[] = [];
		for (const [i, tab] of TABS.entries()) {
			const isActive = i === this.currentTabIndex;
			const text = ` ${tab.icon} ${tab.label} `;
			parts.push(isActive ? this.theme.bold(this.theme.fg("accent", text)) : this.theme.fg("dim", text));
		}
		return `  ${parts.join("│")}`;
	}

	handleInput(data: string): void {
		// Submenu takes priority
		if (this.submenu) {
			this.submenu.handleInput(data);
			return;
		}

		// Escape closes overlay
		if (data === "\x1b" || data === "q") {
			this.callbacks.onClose();
			return;
		}

		// Tab navigation (Tab/Shift+Tab or Left/Right)
		if (data === "\t" || data === "\x1b[C") {
			this.currentTabIndex = (this.currentTabIndex + 1) % TABS.length;
			this.selectedIndex = 0;
			this.scrollOffset = 0;
			return;
		}
		if (data === "Z" || data === "\x1b[D") {
			this.currentTabIndex = (this.currentTabIndex - 1 + TABS.length) % TABS.length;
			this.selectedIndex = 0;
			this.scrollOffset = 0;
			return;
		}

		// Item navigation
		const tabId = TABS[this.currentTabIndex]?.id ?? "runtime";
		const settings = SETTINGS.filter(s => s.tab === tabId);

		if (data === "\x1b[A" || data === "k") {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.ensureVisible(settings.length);
			return;
		}
		if (data === "\x1b[B" || data === "j") {
			this.selectedIndex = Math.min(settings.length - 1, this.selectedIndex + 1);
			this.ensureVisible(settings.length);
			return;
		}

		// Activate item
		if (data === "\r" || data === "\n" || data === " ") {
			this.activateItem(settings);
		}
	}

	private activateItem(settings: SettingDef[]): void {
		const def = settings[this.selectedIndex];
		if (!def) return;

		const current = this.changedValues.has(def.id) ? this.changedValues.get(def.id) : getNestedValue(this.config, def.id);

		switch (def.type) {
			case "boolean": {
				const newVal = current !== true;
				this.changedValues.set(def.id, newVal);
				this.callbacks.onChange(def.id, newVal);
				break;
			}
			case "enum": {
				if (!def.values?.length) return;
				this.submenuSettingId = def.id;
				this.submenu = new SelectSubmenu(
					def.label,
					def.values,
					typeof current === "string" ? current : def.values[0]!,
					this.theme,
					(value: string) => {
						this.changedValues.set(def.id, value);
						this.callbacks.onChange(def.id, value);
						this.submenu = null;
						this.submenuSettingId = null;
					},
					() => {
						this.submenu = null;
						this.submenuSettingId = null;
					},
				);
				break;
			}
			case "number": {
				this.submenuSettingId = def.id;
				this.submenu = new TextinputSubmenu(
					def.label,
					def.description ?? "",
					typeof current === "number" ? String(current) : "",
					this.theme,
					(value: string) => {
						const num = value === "" ? undefined : Number(value);
						if (num !== undefined && !Number.isNaN(num)) {
							this.changedValues.set(def.id, num);
							this.callbacks.onChange(def.id, num);
						} else if (value === "") {
							this.changedValues.set(def.id, undefined);
							this.callbacks.onChange(def.id, undefined);
						}
						this.submenu = null;
						this.submenuSettingId = null;
					},
					() => {
						this.submenu = null;
						this.submenuSettingId = null;
					},
				);
				break;
			}
			case "string": {
				this.submenuSettingId = def.id;
				this.submenu = new TextinputSubmenu(
					def.label,
					def.description ?? "",
					typeof current === "string" ? current : "",
					this.theme,
					(value: string) => {
						this.changedValues.set(def.id, value || undefined);
						this.callbacks.onChange(def.id, value || undefined);
						this.submenu = null;
						this.submenuSettingId = null;
					},
					() => {
						this.submenu = null;
						this.submenuSettingId = null;
					},
				);
				break;
			}
			case "agent": {
				this.submenu = new AgentOverridesSubmenu(
					this.config,
					this.theme,
					(overrides: Record<string, unknown>) => {
						this.changedValues.set("agents.overrides", overrides);
						this.callbacks.onChange("agents.overrides", overrides);
						this.submenu = null;
						this.submenuSettingId = null;
					},
					() => {
						this.submenu = null;
						this.submenuSettingId = null;
					},
				);
				break;
			}
		}
	}

	private ensureVisible(count: number): void {
		if (this.selectedIndex < this.scrollOffset) {
			this.scrollOffset = this.selectedIndex;
		} else if (this.selectedIndex >= this.scrollOffset + this.maxVisible) {
			this.scrollOffset = Math.max(0, this.selectedIndex - this.maxVisible + 1);
		}
	}
}

/**
 * Create the settings overlay wrapped in DynamicBorder for use with ctx.ui.custom().
 */
export function createSettingsOverlay(
	config: Record<string, unknown>,
	theme: CrewTheme,
	onChange: (id: string, value: unknown) => void,
	done: () => void,
) {
	const overlay = new SettingsOverlay(config, theme, { onChange, onClose: done });
	return { overlay, component: overlay };
}
