import { subprocessToolRegistry, type SubprocessToolEvent } from "./subprocess-tool-registry.ts";

// G3: Full AJV-based schema validation for yield data.
// Falls back to lightweight validation if AJV is unavailable.

let _ajv: Awaited<ReturnType<typeof getAjvInternal>> | null | undefined;

async function getAjvInternal() {
	// LAZY: AJV is an optional heavy validator — only load on first use.
	const mod = await import("ajv");
	const AjvCtor = ("default" in mod ? (mod as Record<string, unknown>).default : mod) as unknown as new (opts: Record<string, unknown>) => { compile: (schema: unknown) => { (data: unknown): boolean; errors?: unknown[] }; errorsText: (errors?: unknown[]) => string };
	return new AjvCtor({ allErrors: true, strict: false, logger: false });
}

async function getAjv() {
	if (_ajv === undefined) {
		try {
			_ajv = await getAjvInternal();
		} catch {
			_ajv = null;
		}
	}
	return _ajv;
}

export interface SchemaValidationResult {
	valid: boolean;
	error?: string;
}

/**
 * Validate yield data against a JSON Schema.
 * Uses AJV when available (hoisted dep from pi-ai), falls back to
 * lightweight type checking when not.
 */
export async function validateYieldData(data: unknown, schema: unknown): Promise<SchemaValidationResult> {
	if (!schema) return { valid: true };
	if (data === undefined || data === null) return { valid: false, error: "Yield data is null or undefined." };

	// Try AJV first
	const ajv = await getAjv();
	if (ajv) {
		try {
			const validate = ajv.compile(schema as Record<string, unknown>);
			const valid = validate(data);
			if (!valid) {
				return { valid: false, error: ajv.errorsText(validate.errors ?? undefined) };
			}
			return { valid: true };
		} catch {
			// AJV compile failed — fall through to lightweight
		}
	}

	// Lightweight fallback
	return lightweightValidate(data, schema);
}

function lightweightValidate(data: unknown, schema: unknown): SchemaValidationResult {
	if (typeof schema === "boolean") return { valid: schema };
	if (typeof schema !== "object" || Array.isArray(schema)) return { valid: true };
	const schemaObj = schema as Record<string, unknown>;

	// Check type constraint
	if (typeof schemaObj.type === "string") {
		const expected = schemaObj.type;
		const actual = Array.isArray(data) ? "array" : typeof data;
		if (expected === "object" && (typeof data !== "object" || Array.isArray(data))) return { valid: false, error: `Expected type '${expected}' but got '${actual}'.` };
		if (expected === "array" && !Array.isArray(data)) return { valid: false, error: `Expected type 'array' but got '${actual}'.` };
		if (expected === "string" && typeof data !== "string") return { valid: false, error: `Expected type 'string' but got '${actual}'.` };
		if (expected === "number" && typeof data !== "number") return { valid: false, error: `Expected type 'number' but got '${actual}'.` };
		if (expected === "boolean" && typeof data !== "boolean") return { valid: false, error: `Expected type 'boolean' but got '${actual}'.` };
	}

	// Check required fields
	if (Array.isArray(schemaObj.required) && typeof data === "object" && data !== null && !Array.isArray(data)) {
		const dataObj = data as Record<string, unknown>;
		for (const field of schemaObj.required) {
			if (typeof field === "string" && !(field in dataObj)) {
				return { valid: false, error: `Missing required field '${field}'.` };
			}
		}
	}

	return { valid: true };
}

export interface YieldResult {
	summary: string;
	artifacts?: Record<string, string>;
	structuredData?: Record<string, unknown>;
	toolCallId: string;
}

export interface YieldConfig {
	enabled: boolean;
	maxReminders: number;
	reminderPrompt: string;
}

export const DEFAULT_YIELD_CONFIG: YieldConfig = {
	enabled: true,
	maxReminders: 3,
	reminderPrompt: "You must call the submit_result tool to return your results.",
};

/** Tool name used by workers to yield their result. */
export const YIELD_TOOL_NAME = "submit_result";

/**
 * Check if a value is a plain object record (non-null, non-array object).
 */
function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Check if a value is a record with all string values.
 */
function isStringRecord(value: unknown): value is Record<string, string> {
	if (!isObjectRecord(value)) return false;
	return Object.values(value).every((v) => typeof v === "string");
}

/**
 * Shared helper to extract yield data from tool call arguments.
 * Used by both `extractYieldResult` and `registerYieldTool.extractData`
 * to avoid duplicating parsing logic.
 */
export function extractYieldDataFromArgs(args: unknown, toolCallId: string): YieldResult | undefined {
	if (!isObjectRecord(args)) return undefined;
	const summary = typeof args.summary === "string" ? args.summary : "";
	if (!summary) return undefined;
	const result: YieldResult = { summary, toolCallId };
	if (args.artifacts && isStringRecord(args.artifacts)) {
		result.artifacts = args.artifacts;
	}
	if (args.structuredData && isObjectRecord(args.structuredData)) {
		result.structuredData = args.structuredData;
	}
	return result;
}

/**
 * Check if a JSON event represents a yield/submit_result tool call.
 * Supports event types: tool_execution_start, toolCall, tool_call.
 */
export function isYieldEvent(event: Record<string, unknown>): boolean {
	const type = event.type;
	if (type !== "tool_execution_start" && type !== "toolCall" && type !== "tool_call") return false;
	const toolName = event.toolName ?? event.name ?? event.tool;
	return toolName === YIELD_TOOL_NAME;
}

/**
 * Extract structured result from a yield event.
 */
export function extractYieldResult(event: Record<string, unknown>): YieldResult | undefined {
	if (!isYieldEvent(event)) return undefined;
	const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : "";
	return extractYieldDataFromArgs(event.args, toolCallId);
}

/**
 * Check if a worker output sequence contains a yield.
 */
export function hasYieldInOutput(events: Record<string, unknown>[]): boolean {
	return events.some((event) => isYieldEvent(event));
}

/**
 * Build a reminder prompt for workers that haven't yielded.
 */
export function buildYieldReminder(attempt: number, maxAttempts: number, reminderPrompt?: string): string {
	return `[Yield Reminder ${attempt}/${maxAttempts}] ${reminderPrompt ?? DEFAULT_YIELD_CONFIG.reminderPrompt}`;
}

/**
 * Register the submit_result tool handler in the subprocess tool registry.
 */
export function registerYieldTool(): void {
	subprocessToolRegistry.register<YieldResult>(YIELD_TOOL_NAME, {
		extractData(event: SubprocessToolEvent): YieldResult | undefined {
			return extractYieldDataFromArgs(event.args, event.toolCallId);
		},
		shouldTerminate(): boolean {
			return true;
		},
	});
}
