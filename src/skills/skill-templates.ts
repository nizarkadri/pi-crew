/**
 * Template-based skill initialization for pi-crew.
 *
 * Provides builtin skill templates that can be instantiated with project-specific
 * variables to produce ready-to-use SKILL.md files.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillVariable {
	/** Variable name used as placeholder key in the template body, e.g. "language". */
	name: string;
	/** Human-readable description of what this variable controls. */
	description: string;
	/** When true the caller must supply a value (no default available). */
	required: boolean;
	/** Default value used when the variable is optional and no value is supplied. */
	defaultValue?: string;
	/** If set, the supplied value must be one of these strings. */
	options?: string[];
}

export interface SkillTemplate {
	/** Unique template identifier, e.g. "code-review". */
	id: string;
	/** Human-readable name. */
	name: string;
	/** Short description of the skill this template produces. */
	description: string;
	/** Category for grouping (e.g. "quality", "testing", "documentation"). */
	category: string;
	/** Template variables referenced via {varName} in the body. */
	variables: SkillVariable[];
	/** Markdown template body with {variableName} placeholders. */
	body: string;
	/** Hard rules the instantiated skill must follow. */
	guardrails: string[];
}

export interface InstantiatedSkill {
	/** Suggested filename, e.g. "code-review.SKILL.md". */
	filename: string;
	/** Fully rendered markdown content. */
	content: string;
}

// ---------------------------------------------------------------------------
// Builtin templates
// ---------------------------------------------------------------------------

const CODE_REVIEW_TEMPLATE: SkillTemplate = {
	id: "code-review",
	name: "Code Review",
	description: "Systematic code review skill with configurable language and focus areas.",
	category: "quality",
	variables: [
		{ name: "language", description: "Primary programming language of the codebase", required: true, options: ["TypeScript", "JavaScript", "Python", "Rust", "Go", "Java", "C#", "Other"] },
		{ name: "focusAreas", description: "Comma-separated list of review focus areas", required: false, defaultValue: "correctness, readability, performance" },
		{ name: "severityThreshold", description: "Minimum severity level to report", required: false, defaultValue: "warning", options: ["info", "warning", "error", "critical"] },
	],
	body: [
		"---",
		"description: Automated code review for {language} projects",
		"---",
		"",
		"# Code Review Skill",
		"",
		"You are a code reviewer specializing in **{language}**.",
		"",
		"## Focus Areas",
		"",
		"Prioritize the following aspects (in order):",
		"",
		"{focusAreas}",
		"",
		"## Severity Threshold",
		"",
		"Only surface issues at or above **{severityThreshold}** severity.",
		"",
		"## Process",
		"",
		"1. Read the full diff / files before commenting.",
		"2. Classify each finding by severity.",
		"3. Provide actionable suggestions with code examples where helpful.",
		"4. Summarize overall quality and risk assessment.",
	].join("\n"),
	guardrails: [
		"Do not approve code you have not fully read.",
		"Do not comment on style issues that are already handled by a linter.",
		"Do not suggest changes without explaining the reasoning.",
	],
};

const TESTING_TEMPLATE: SkillTemplate = {
	id: "testing",
	name: "Testing",
	description: "Test writing skill with configurable framework and coverage targets.",
	category: "testing",
	variables: [
		{ name: "framework", description: "Testing framework to use", required: true, options: ["vitest", "jest", "mocha", "pytest", "go-test", "cargo-test", "Other"] },
		{ name: "coverageTarget", description: "Target coverage percentage", required: false, defaultValue: "80" },
		{ name: "testType", description: "Primary type of tests to write", required: false, defaultValue: "unit", options: ["unit", "integration", "e2e", "all"] },
	],
	body: [
		"---",
		"description: Write tests using {framework} with {coverageTarget}% coverage target",
		"---",
		"",
		"# Testing Skill",
		"",
		"You are a test engineer writing **{testType}** tests using **{framework}**.",
		"",
		"## Coverage Target",
		"",
		"Aim for at least **{coverageTarget}%** code coverage.",
		"",
		"## Guidelines",
		"",
		"1. Write descriptive test names that explain the expected behavior.",
		"2. Follow the Arrange-Act-Assert pattern.",
		"3. Test edge cases and error paths, not just the happy path.",
		"4. Keep tests independent — no shared mutable state between tests.",
		"5. Mock external dependencies; do not hit real network services.",
	].join("\n"),
	guardrails: [
		"Do not skip testing error paths.",
		"Do not write tests that depend on execution order.",
		"Do not mock the system under test.",
	],
};

const SECURITY_AUDIT_TEMPLATE: SkillTemplate = {
	id: "security-audit",
	name: "Security Audit",
	description: "Security review skill with configurable scope and severity thresholds.",
	category: "security",
	variables: [
		{ name: "scope", description: "Audit scope: what parts of the codebase to examine", required: true, options: ["full-codebase", "dependencies", "api-surface", "auth-flows", "input-handling"] },
		{ name: "severityThreshold", description: "Minimum severity to report", required: false, defaultValue: "medium", options: ["low", "medium", "high", "critical"] },
		{ name: "complianceFramework", description: "Compliance framework to check against (if applicable)", required: false, defaultValue: "OWASP Top 10" },
	],
	body: [
		"---",
		"description: Security audit focusing on {scope} (threshold: {severityThreshold})",
		"---",
		"",
		"# Security Audit Skill",
		"",
		"You are a security auditor performing a **{scope}** review.",
		"",
		"## Severity Threshold",
		"",
		"Report all findings at or above **{severityThreshold}** severity.",
		"",
		"## Compliance Framework",
		"",
		"Check against: **{complianceFramework}**.",
		"",
		"## Methodology",
		"",
		"1. Identify the attack surface relevant to the chosen scope.",
		"2. Trace data flows from untrusted inputs.",
		"3. Check for common vulnerability classes (injection, auth bypass, etc.).",
		"4. Verify that secrets/credentials are handled safely.",
		"5. Document each finding with severity, description, and remediation.",
	].join("\n"),
	guardrails: [
		"Do not ignore low-severity findings that could chain into higher-severity exploits.",
		"Do not report theoretical issues without evidence in the code.",
		"Do not store or log real secrets/credentials during the audit.",
	],
};

const REFACTOR_TEMPLATE: SkillTemplate = {
	id: "refactor",
	name: "Refactor",
	description: "Refactoring skill with configurable scope and constraints.",
	category: "maintenance",
	variables: [
		{ name: "scope", description: "What to refactor: file, module, or architectural pattern", required: true },
		{ name: "constraints", description: "Constraints to respect during refactoring", required: false, defaultValue: "preserve public API, maintain backward compatibility" },
		{ name: "goal", description: "Primary refactoring goal", required: false, defaultValue: "improve readability and reduce complexity", options: ["improve readability and reduce complexity", "improve performance", "reduce coupling", "enable extensibility", "simplify testability"] },
	],
	body: [
		"---",
		"description: Refactoring skill targeting {scope}",
		"---",
		"",
		"# Refactor Skill",
		"",
		"You are a refactoring specialist working on **{scope}**.",
		"",
		"## Goal",
		"",
		"Primary objective: **{goal}**.",
		"",
		"## Constraints",
		"",
		"The following constraints must be respected:",
		"",
		"- {constraints}",
		"",
		"## Approach",
		"",
		"1. Understand the current code structure and all usages.",
		"2. Plan the refactoring in small, reviewable steps.",
		"3. Run existing tests after each step to verify correctness.",
		"4. Add new tests if the refactoring introduces new behavior.",
		"5. Document any architectural decisions made during the refactor.",
	].join("\n"),
	guardrails: [
		"Do not change public API signatures without explicit approval.",
		"Do not mix refactoring with feature changes.",
		"Do not skip running tests between steps.",
	],
};

const DOCUMENTATION_TEMPLATE: SkillTemplate = {
	id: "documentation",
	name: "Documentation",
	description: "Documentation writing skill with configurable format and audience.",
	category: "documentation",
	variables: [
		{ name: "format", description: "Documentation format to produce", required: true, options: ["markdown", "jsdoc", "rustdoc", "godoc", "pydoc", "openapi"] },
		{ name: "audience", description: "Target audience for the documentation", required: false, defaultValue: "developers", options: ["developers", "operators", "end-users", "contributors", "architects"] },
		{ name: "detailLevel", description: "Level of detail", required: false, defaultValue: "standard", options: ["brief", "standard", "comprehensive"] },
	],
	body: [
		"---",
		"description: Write {format} documentation for {audience}",
		"---",
		"",
		"# Documentation Skill",
		"",
		"You are a technical writer producing **{format}** documentation",
		"for **{audience}**.",
		"",
		"## Detail Level",
		"",
		"Detail level: **{detailLevel}**.",
		"",
		"## Guidelines",
		"",
		"1. Start with a brief summary of what the module/function does.",
		"2. Document all public APIs with parameter descriptions and return types.",
		"3. Include usage examples for non-trivial functionality.",
		"4. Keep language clear and avoid unnecessary jargon.",
		"5. Cross-reference related modules where applicable.",
	].join("\n"),
	guardrails: [
		"Do not document private/internal APIs unless specifically requested.",
		"Do not generate placeholder content — every section must be meaningful.",
		"Do not duplicate information already present in existing docs.",
	],
};

const BUILTIN_TEMPLATES: SkillTemplate[] = [
	CODE_REVIEW_TEMPLATE,
	TESTING_TEMPLATE,
	SECURITY_AUDIT_TEMPLATE,
	REFACTOR_TEMPLATE,
	DOCUMENTATION_TEMPLATE,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return all builtin skill templates.
 */
export function getBuiltinTemplates(): SkillTemplate[] {
	return BUILTIN_TEMPLATES;
}

/**
 * Look up a builtin template by its id or name (case-insensitive).
 */
export function findTemplate(idOrName: string): SkillTemplate | undefined {
	const lower = idOrName.toLowerCase();
	return BUILTIN_TEMPLATES.find(
		(t) => t.id.toLowerCase() === lower || t.name.toLowerCase() === lower,
	);
}

/**
 * Instantiate a skill template by filling in its variables.
 *
 * - Required variables that are missing throw an error.
 * - Optional variables fall back to their `defaultValue` if not supplied.
 * - Variables with `options` constrain the allowed values.
 *
 * @param template  The template to instantiate.
 * @param variables User-supplied variable values.
 * @returns An object with the suggested filename and rendered content.
 */
export function instantiateTemplate(
	template: SkillTemplate,
	variables: Record<string, string>,
): InstantiatedSkill {
	// Validate and resolve all variable values
	const resolved: Record<string, string> = {};

	for (const variable of template.variables) {
		const value = variables[variable.name];

		if (value === undefined || value === "") {
			if (variable.required) {
				throw new Error(
					`Missing required variable "${variable.name}" for template "${template.id}" (${variable.description}).`,
				);
			}
			resolved[variable.name] = variable.defaultValue ?? "";
			continue;
		}

		// Validate options constraint
		if (variable.options !== undefined && !variable.options.includes(value)) {
			throw new Error(
				`Invalid value "${value}" for variable "${variable.name}" in template "${template.id}". ` +
				`Allowed values: ${variable.options.join(", ")}.`,
			);
		}

		resolved[variable.name] = value;
	}

	// Render the template body by replacing all {varName} placeholders
	let content = template.body;
	for (const [key, value] of Object.entries(resolved)) {
		// Use a global regex to replace all occurrences of {key}
		const placeholderRegex = new RegExp(`\\{${escapeRegExp(key)}\\}`, "g");
		content = content.replace(placeholderRegex, value);
	}

	// Build filename from template id
	const filename = `${template.id}.SKILL.md`;

	return { filename, content };
}

/**
 * Return a simplified list of available templates suitable for display.
 * Each entry contains id, name, description, category, and variable names.
 */
export function listTemplates(): Array<{
	id: string;
	name: string;
	description: string;
	category: string;
	variables: Array<{ name: string; required: boolean }>;
}> {
	return BUILTIN_TEMPLATES.map((t) => ({
		id: t.id,
		name: t.name,
		description: t.description,
		category: t.category,
		variables: t.variables.map((v) => ({ name: v.name, required: v.required })),
	}));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Escape special regex characters in a string so it can be used inside a
 * RegExp constructor.
 */
function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
