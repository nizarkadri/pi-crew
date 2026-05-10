/**
 * Validation severity levels for pi-crew config.
 *
 * - Required fields invalid → always ERROR
 * - Optional fields invalid → ERROR (strict) / WARNING (lenient)
 * - Missing recommended optional fields → INFO
 * - Values outside recommended ranges → WARNING
 */

import { Value } from "typebox/value";
import { PiTeamsConfigSchema } from "./config-schema.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValidationSeverity = "ERROR" | "WARNING" | "INFO";

export type ValidationMode = "strict" | "lenient";

export interface ValidationFinding {
	severity: ValidationSeverity;
	message: string;
	field?: string;
	suggestion?: string;
}

export interface ValidationOutcome {
	findings: ValidationFinding[];
	mode: ValidationMode;
	hasErrors: boolean;
	hasWarnings: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODE: ValidationMode = "strict";

/** Recommended range constraints (not enforced by schema, but advisory). */
const RECOMMENDED_RANGES: Record<string, { max: number; label: string }> = {
	"limits.maxConcurrentWorkers": { max: 8, label: "maxConcurrentWorkers > 8 may degrade performance" },
	"limits.maxTaskDepth": { max: 4, label: "maxTaskDepth > 4 may cause excessive nesting" },
};

/** Recommended optional top-level keys that should be explicitly set. */
const RECOMMENDED_OPTIONAL_KEYS: readonly string[] = [
	"limits",
	"runtime",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getNestedValue(obj: Record<string, unknown>, dottedPath: string): unknown {
	const parts = dottedPath.split(".");
	let current: unknown = obj;
	for (const part of parts) {
		if (!isObject(current)) return undefined;
		current = current[part];
	}
	return current;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Validate a raw config value with severity-tagged findings.
 *
 * @param raw   The raw config value to validate.
 * @param mode  Validation mode — 'strict' (default) or 'lenient'.
 * @returns     A `ValidationOutcome` with findings grouped by severity.
 */
export function validateWithSeverity(raw: unknown, mode: ValidationMode = DEFAULT_MODE): ValidationOutcome {
	const findings: ValidationFinding[] = [];

	if (!isObject(raw)) {
		findings.push({ severity: "ERROR", message: "config must be an object", field: "config" });
		return { findings, mode, hasErrors: true, hasWarnings: false };
	}

	// --- Schema-based validation ---
	const isValid = Value.Check(PiTeamsConfigSchema, raw);
	if (!isValid) {
		for (const error of Value.Errors(PiTeamsConfigSchema, raw)) {
			const errRecord = error as unknown as Record<string, unknown>;
			const rawPath = typeof errRecord.path === "string"
				? errRecord.path
				: typeof errRecord.instancePath === "string"
					? errRecord.instancePath
					: "config";

			const message = typeof errRecord.message === "string"
				? errRecord.message
				: "invalid value";

			const field = rawPath.replace(/^\//, "").replace(/\//g, ".") || undefined;

			// Additional properties are less severe in lenient mode
			if (errRecord.keyword === "additionalProperties") {
				findings.push({
					severity: mode === "lenient" ? "WARNING" : "ERROR",
					message: `unknown property${field ? ` '${field}'` : ""}: ${message}`,
					field,
				});
			} else {
				findings.push({ severity: "ERROR", message, field });
			}
		}
	}

	// --- Missing recommended optional keys → INFO ---
	for (const key of RECOMMENDED_OPTIONAL_KEYS) {
		if (!(key in raw)) {
			findings.push({
				severity: "INFO",
				message: `recommended config section '${key}' is not set`,
				field: key,
			});
		}
	}

	// --- Values outside recommended ranges → WARNING ---
	for (const [dottedPath, constraint] of Object.entries(RECOMMENDED_RANGES)) {
		const value = getNestedValue(raw, dottedPath);
		if (typeof value === "number" && value > constraint.max) {
			findings.push({
				severity: "WARNING",
				message: constraint.label,
				field: dottedPath,
				suggestion: `consider using a value ≤ ${constraint.max}`,
			});
		}
	}

	const hasErrors = findings.some((f) => f.severity === "ERROR");
	const hasWarnings = findings.some((f) => f.severity === "WARNING");

	return { findings, mode, hasErrors, hasWarnings };
}
