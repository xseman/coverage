import type {
	CoverageReport,
	ToolCoverageReport,
} from "./types.js";

export interface CommitInfo {
	sha: string;
	baseSha?: string;
	owner: string;
	repo: string;
}

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

function renderCoverageDiff(report: CoverageReport): string | null {
	const o = report.overall;
	if (o.basePercent === null) return null;

	const baseCovered = report.tools.reduce((s, t) => s + (t.summary.baseCoveredLines ?? 0), 0);
	const baseTotal = report.tools.reduce((s, t) => s + (t.summary.baseTotalLines ?? 0), 0);
	const headFiles = report.tools.reduce(
		(s, t) => s + t.files.filter((f) => f.totalLines > 0).length,
		0,
	);
	const baseFiles = report.tools.reduce(
		(s, t) => s + t.files.filter((f) => (f.baseTotalLines ?? 0) > 0).length,
		0,
	);

	function fmtDiff(head: number, base: number): string {
		const d = head - base;
		if (d === 0) return "0";
		return d > 0 ? `+${d}` : String(d);
	}

	function fmtPctDiff(d: number | null): string {
		if (d === null) return "";
		if (d === 0) return "0.00%";
		return `${d > 0 ? "+" : ""}${d.toFixed(2)}%`;
	}

	const hitsDelta = o.coveredLines - baseCovered;

	type RowData = { prefix: string; label: string; base: string; head: string; diff: string; };
	const rows: (RowData | "sep")[] = [
		{
			prefix: " ",
			label: "Coverage",
			base: `${o.basePercent.toFixed(2)}%`,
			head: `${o.percent.toFixed(2)}%`,
			diff: fmtPctDiff(o.delta),
		},
		"sep",
		{
			prefix: " ",
			label: "Files",
			base: String(baseFiles),
			head: String(headFiles),
			diff: fmtDiff(headFiles, baseFiles),
		},
		{
			prefix: " ",
			label: "Lines",
			base: String(baseTotal),
			head: String(o.totalLines),
			diff: fmtDiff(o.totalLines, baseTotal),
		},
		"sep",
		{
			prefix: hitsDelta > 0 ? "+" : hitsDelta < 0 ? "-" : " ",
			label: "Hits",
			base: String(baseCovered),
			head: String(o.coveredLines),
			diff: fmtDiff(o.coveredLines, baseCovered),
		},
	];

	const actual = rows.filter((r): r is RowData => r !== "sep");
	const lw = Math.max(...actual.map((r) => r.label.length));
	const bw = Math.max("base".length, ...actual.map((r) => r.base.length));
	const hw = Math.max("head".length, ...actual.map((r) => r.head.length));
	const dw = Math.max("+/-".length, ...actual.map((r) => r.diff.length));

	function fmtColumns(
		prefix: string,
		label: string,
		base: string,
		head: string,
		diff: string,
	): string {
		return `${prefix} ${label.padEnd(lw)}  ${base.padStart(bw)}  ${head.padStart(hw)}  ${
			diff.padStart(dw)
		}`;
	}

	function fmtRow(r: RowData): string {
		return fmtColumns(r.prefix, r.label, r.base, r.head, r.diff);
	}

	function fmtHeaderColumns(base: string, head: string, diff: string): string {
		return `  ${"".padEnd(lw)}  ${base.padEnd(bw)}  ${head.padEnd(hw)}  ${diff.padEnd(dw)}`;
	}

	const rowLen = fmtRow(actual[0]).length;
	const w = Math.max(rowLen + 4, 40);

	const sep = "=".repeat(w);

	const title = "Coverage Diff";
	const innerW = w - 4;
	const tPad = innerW - title.length;
	const tl = Math.floor(tPad / 2);
	const tr = tPad - tl;

	const colInner = fmtHeaderColumns("base", "head", "+/-");

	const lines: string[] = [
		`@@${" ".repeat(tl)}${title}${" ".repeat(tr)}@@`,
		`##${colInner.padEnd(innerW)}##`,
	];

	for (const row of rows) {
		if (row === "sep") {
			lines.push(sep);
		} else {
			lines.push(fmtRow(row));
		}
	}
	lines.push(sep);

	return lines.join("\n");
}

export function renderReport(
	report: CoverageReport,
	marker: string,
	colorize: boolean,
	commitInfo?: CommitInfo,
): string {
	const parts: string[] = [];

	parts.push(marker);
	parts.push("## Coverage Report\n");

	// Project coverage summary line
	const pct = report.overall.percent.toFixed(2);
	if (commitInfo?.baseSha) {
		const headShort = commitInfo.sha.slice(0, 7);
		const headUrl =
			`https://github.com/${commitInfo.owner}/${commitInfo.repo}/commit/${commitInfo.sha}`;
		const baseShort = commitInfo.baseSha.slice(0, 7);
		const baseUrl =
			`https://github.com/${commitInfo.owner}/${commitInfo.repo}/commit/${commitInfo.baseSha}`;
		parts.push(
			`Project coverage is ${pct}%. Comparing base ([\`${baseShort}\`](${baseUrl})) to head ([\`${headShort}\`](${headUrl})).\n`,
		);
	} else if (commitInfo) {
		const headShort = commitInfo.sha.slice(0, 7);
		const headUrl =
			`https://github.com/${commitInfo.owner}/${commitInfo.repo}/commit/${commitInfo.sha}`;
		parts.push(`Project coverage is ${pct}%. Commit [\`${headShort}\`](${headUrl}).\n`);
	} else {
		parts.push(`Project coverage is ${pct}%.\n`);
	}

	// Coverage Diff table (only when base data is available)
	const diffTable = renderCoverageDiff(report);
	if (diffTable) {
		parts.push("```diff");
		parts.push(diffTable);
		parts.push("```\n");
	}

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
