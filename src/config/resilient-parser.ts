/**
 * Per-field resilient config parsing — continues on error, collects all field-level issues.
 */

import { PiTeamsConfigSchema } from "../schema/config-schema.ts";
import { Value } from "typebox/value";
import { suggestConfigKey } from "./suggestions.ts";
import {
	parseConfig,
	type PiTeamsConfig,
} from "./config.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FieldError {
	field: string;
	message: string;
	value: unknown;
	suggestion?: string;
}

export interface ResilientParseResult {
	config: Record<string, unknown>;
	errors: FieldError[];
	warnings: string[];
	valid: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KNOWN_TOP_LEVEL_KEYS: readonly string[] = Object.keys(PiTeamsConfigSchema.properties ?? {});

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Parse a raw config value field-by-field.
 *
 * - Each top-level key is validated independently via TypeBox sub-schemas.
 * - Fields that fail are recorded as errors but do not block others.
 * - Unknown keys get a fuzzy suggestion via Levenshtein distance.
 * - The returned `config` contains only successfully-parsed fields (via `parseConfig`).
 */
export function parseConfigResilient(raw: unknown): ResilientParseResult {
	const errors: FieldError[] = [];
	const warnings: string[] = [];

	if (!isObject(raw)) {
		return { config: {}, errors: [{ field: "config", message: "config must be an object", value: raw }], warnings, valid: false };
	}

	// Collect unknown top-level keys with suggestions
	for (const key of Object.keys(raw)) {
		if (!KNOWN_TOP_LEVEL_KEYS.includes(key)) {
			const suggestion = suggestConfigKey(key, KNOWN_TOP_LEVEL_KEYS);
			errors.push({
				field: key,
				message: `unknown config key '${key}'`,
				value: raw[key],
				suggestion: suggestion ?? undefined,
			});
		}
	}

	// Use TypeBox per-field validation for known keys
	for (const key of KNOWN_TOP_LEVEL_KEYS) {
		if (!(key in raw)) continue;
		const value = raw[key];
		const subSchema = (PiTeamsConfigSchema.properties as Record<string, unknown>)[key];
		if (subSchema && !Value.Check(subSchema as { [key: string]: unknown }, value)) {
			// Collect the first error for this field
			const fieldErrors = [...Value.Errors(subSchema as { [key: string]: unknown }, value)];
			if (fieldErrors.length > 0) {
				const first = fieldErrors[0] as unknown as Record<string, unknown>;
				const msg = typeof first.message === "string" ? first.message : "invalid value";
				errors.push({
					field: key,
					message: msg,
					value,
				});
			}
		}
	}

	// Build the valid subset using existing parseConfig (which silently drops invalid fields)
	const parsed: PiTeamsConfig = parseConfig(raw);
	const config: Record<string, unknown> = {};
	for (const key of Object.keys(parsed)) {
		const val = (parsed as Record<string, unknown>)[key];
		if (val !== undefined) config[key] = val;
	}

	return {
		config,
		errors,
		warnings,
		valid: errors.length === 0,
	};
}
