import type {
	CoverageReport,
	ToolCoverageReport,
} from "./types.js";

// ── Helpers ─────────────────────────────────────────────────────────

function pad(n: number, width: number): string {
	const s = String(n);
	return " ".repeat(Math.max(0, width - s.length)) + s;
}

function deltaStr(delta: number | null, colorize: boolean): string {
	if (delta === null) return "";
	const sign = delta >= 0 ? "+" : "";
	const pct = `${sign}${delta.toFixed(2)}%`;
	if (!colorize) return ` (${pct})`;
	if (delta > 0) return ` [+] ${pct}`;
	if (delta < 0) return ` [-] ${pct}`;
	return "";
}

// ── Per-tool section ────────────────────────────────────────────────

function renderToolSection(report: ToolCoverageReport, colorize: boolean): string {
	const lines: string[] = [];
	const toolLabel = report.tool.charAt(0).toUpperCase() + report.tool.slice(1);

	// Warnings
	for (const w of report.warnings) {
		lines.push(`WARNING: ${w}`);
	}

	if (report.files.length === 0 && report.warnings.length > 0) {
		lines.push("");
		return lines.join("\n");
	}

	// Compute column widths for alignment
	const maxCovered = Math.max(...report.files.map((f) => String(f.coveredLines).length), 1);
	const maxTotal = Math.max(...report.files.map((f) => String(f.totalLines).length), 1);

	for (const f of report.files) {
		const pct = `${f.percent.toFixed(2)}%`.padStart(7);
		const covered = pad(f.coveredLines, maxCovered);
		const total = pad(f.totalLines, maxTotal);
		const delta = deltaStr(f.delta, colorize);
		lines.push(`${pct} (${covered}/${total}) ${f.file}${delta}`);
	}

	const s = report.summary;
	const totalDelta = deltaStr(s.delta, colorize);

	lines.push("");
	lines.push(`${toolLabel} Coverage: ${s.percent.toFixed(2)}%${totalDelta}`);

	return lines.join("\n");
}

// ── Full render ─────────────────────────────────────────────────────

export function renderReport(
	report: CoverageReport,
	marker: string,
	colorize: boolean,
): string {
	const parts: string[] = [];

	parts.push(marker);
	parts.push("## Coverage Report\n");

	for (const tool of report.tools) {
		parts.push("```");
		parts.push(renderToolSection(tool, colorize));
		parts.push("```\n");
	}

	// Overall (only when multiple tools)
	if (report.tools.length > 1) {
		const o = report.overall;
		const totalDelta = deltaStr(o.delta, colorize);
		parts.push(`**Total Coverage: ${o.percent.toFixed(2)}%${totalDelta}**\n`);
	}

	parts.push("---");
	parts.push(
		`<sub>Generated at ${report.generatedAt} by <a href="https://github.com/xseman/coverage">coverage</a></sub>`,
	);

	return parts.join("\n");
}
