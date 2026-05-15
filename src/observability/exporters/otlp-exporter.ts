import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { logInternalError } from "../../utils/internal-error.ts";
import { redactSecrets } from "../../utils/redaction.ts";
import type { MetricRegistry } from "../metric-registry.ts";
import type { MetricSnapshot } from "../metrics-primitives.ts";
import type { MetricExporter } from "./adapter.ts";

const gzipAsync = promisify(gzip);

export interface OTLPExporterOptions {
	endpoint: string;
	headers?: Record<string, string>;
	intervalMs?: number;
	timeoutMs?: number;
}

function pointValues(snapshot: MetricSnapshot): unknown[] {
	const MAX_LABEL_LENGTH = 256;
	if (snapshot.type === "histogram") {
		return snapshot.values.map((value) => ({
			attributes: Object.entries(value.labels).map(([key, item]) => {
				const redacted = redactSecrets({ [key]: item }) as Record<string, string>;
				const val = String(redacted[key] ?? item);
				return { key, value: { stringValue: val.length > MAX_LABEL_LENGTH ? val.slice(0, MAX_LABEL_LENGTH) : val } };
			}),
			count: "count" in value ? value.count : undefined,
			sum: "sum" in value ? value.sum : undefined,
			bucketCounts: "counts" in value ? value.counts : undefined,
			explicitBounds: "buckets" in value ? value.buckets : undefined,
		}));
	}
	return snapshot.values.map((value) => ({
		attributes: Object.entries(value.labels).map(([key, item]) => {
			const redacted = redactSecrets({ [key]: item }) as Record<string, string>;
			const val = String(redacted[key] ?? item);
			return { key, value: { stringValue: val.length > MAX_LABEL_LENGTH ? val.slice(0, MAX_LABEL_LENGTH) : val } };
		}),
		asDouble: "value" in value ? value.value : undefined,
		count: "count" in value ? value.count : undefined,
		sum: "sum" in value ? value.sum : undefined,
	}));
}

export function convertToOTLP(snapshots: MetricSnapshot[]): unknown {
	return {
		resourceMetrics: [{
			resource: { attributes: [{ key: "service.name", value: { stringValue: "pi-crew" } }] },
			scopeMetrics: [{
				scope: { name: "pi-crew" },
				metrics: snapshots.map((snapshot) => ({ name: snapshot.name, description: snapshot.description, [snapshot.type === "histogram" ? "histogram" : snapshot.type === "gauge" ? "gauge" : "sum"]: { dataPoints: pointValues(snapshot) } })),
			}],
		}],
	};
}

export class OTLPExporter implements MetricExporter {
	name = "otlp";
	private timer?: ReturnType<typeof setInterval>;
	private readonly opts: OTLPExporterOptions;
	private readonly registry: MetricRegistry;

	constructor(opts: OTLPExporterOptions, registry: MetricRegistry) {
		this.opts = opts;
		this.registry = registry;
	}

	start(): void {
		this.dispose();
		this.timer = setInterval(() => { void this.push(this.registry.snapshot()); }, this.opts.intervalMs ?? 60_000);
		this.timer.unref();
	}

	async push(snapshots: MetricSnapshot[]): Promise<void> {
		try {
			const timeoutMs = this.opts.timeoutMs ?? 10_000;
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutMs);
			try {
				// 4.2: gzip body. OTLP HTTP exporters of every flavour accept
				// `content-encoding: gzip`; collectors expect uncompressed JSON
				// otherwise. Saves bandwidth on metric-heavy runs (often 3-5x).
				const json = JSON.stringify(convertToOTLP(snapshots));
				const body = await gzipAsync(Buffer.from(json));
				const response = await fetch(this.opts.endpoint, {
					method: "POST",
					headers: { "content-type": "application/json", "content-encoding": "gzip", ...(this.opts.headers ?? {}) },
					body,
					signal: controller.signal,
				});
				if (!response.ok) {
					logInternalError("otlp-export-http", new Error(`HTTP ${response.status}: ${response.statusText}`), `endpoint=${this.opts.endpoint}`);
				}
			} finally {
				clearTimeout(timer);
			}
		} catch (error) {
			logInternalError("otlp-export", error);
		}
	}

	dispose(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = undefined;
	}
}
