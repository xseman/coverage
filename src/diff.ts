import {
	calculatePercent,
	roundDelta,
} from "./percent.js";
import type {
	CoverageArtifact,
	CoverageReport,
	FileCoverage,
	FileCoverageDelta,
	ToolCoverageReport,
} from "./types.js";

/**
 * Compute per-file deltas by comparing head coverage against an optional base.
 */
export function computeFileDiffs(
	headFiles: FileCoverage[],
	baseFiles: FileCoverage[] | null,
): FileCoverageDelta[] {
	const baseMap = new Map<string, FileCoverage>();
	if (baseFiles) {
		for (const f of baseFiles) {
			baseMap.set(f.file, f);
		}
	}

	const result: FileCoverageDelta[] = [];

	for (const head of headFiles) {
		const base = baseMap.get(head.file) ?? null;
		result.push({
			...head,
			baseCoveredLines: base?.coveredLines ?? null,
			baseTotalLines: base?.totalLines ?? null,
			basePercent: base?.percent ?? null,
			delta: base ? roundDelta(head.percent, base.percent) : null,
		});
	}

	// Files that existed in base but are gone in head (deleted files)
	if (baseFiles) {
		const headSet = new Set(headFiles.map((f) => f.file));
		for (const base of baseFiles) {
			if (!headSet.has(base.file)) {
				result.push({
					file: base.file,
					coveredLines: 0,
					totalLines: 0,
					percent: 0,
					baseCoveredLines: base.coveredLines,
					baseTotalLines: base.totalLines,
					basePercent: base.percent,
					delta: -base.percent,
				});
			}
		}
	}

	result.sort((a, b) => a.file.localeCompare(b.file));
	return result;
}

/**
 * Build a ToolCoverageReport from head files and optional base artifact.
 */
export function buildToolReport(
	tool: string,
	headFiles: FileCoverage[],
	baseArtifact: CoverageArtifact | null,
	warnings: string[],
): ToolCoverageReport {
	const baseFiles = baseArtifact?.files ?? null;
	const files = computeFileDiffs(headFiles, baseFiles);

	const coveredLines = headFiles.reduce((s, f) => s + f.coveredLines, 0);
	const totalLines = headFiles.reduce((s, f) => s + f.totalLines, 0);
	const percent = calculatePercent(coveredLines, totalLines);

	let baseCoveredLines: number | null = null;
	let baseTotalLines: number | null = null;
	let basePercent: number | null = null;
	let delta: number | null = null;

	if (baseFiles && baseFiles.length > 0) {
		baseCoveredLines = baseFiles.reduce((s, f) => s + f.coveredLines, 0);
		baseTotalLines = baseFiles.reduce((s, f) => s + f.totalLines, 0);
		basePercent = calculatePercent(baseCoveredLines, baseTotalLines);
		delta = roundDelta(percent, basePercent);
	}

	return {
		tool,
		files,
		summary: {
			coveredLines,
			totalLines,
			percent,
			baseCoveredLines,
			baseTotalLines,
			basePercent,
			delta,
		},
		warnings,
	};
}

/**
 * Build the full cross-tool report.
 */
export function buildFullReport(toolReports: ToolCoverageReport[]): CoverageReport {
	const coveredLines = toolReports.reduce((s, t) => s + t.summary.coveredLines, 0);
	const totalLines = toolReports.reduce((s, t) => s + t.summary.totalLines, 0);
	const percent = calculatePercent(coveredLines, totalLines);

	let basePercent: number | null = null;
	let delta: number | null = null;
	const allToolsComparable = toolReports.every((t) => t.summary.baseTotalLines !== null);
	const baseCovered = toolReports.reduce((s, t) => s + (t.summary.baseCoveredLines ?? 0), 0);
	const baseTotal = toolReports.reduce((s, t) => s + (t.summary.baseTotalLines ?? 0), 0);
	if (allToolsComparable && baseTotal > 0) {
		basePercent = calculatePercent(baseCovered, baseTotal);
		delta = roundDelta(percent, basePercent);
	}

	return {
		tools: toolReports,
		overall: { coveredLines, totalLines, percent, basePercent, delta },
		generatedAt: new Date().toISOString(),
	};
}
