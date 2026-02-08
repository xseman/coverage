/** Unified coverage record for a single file. */
export interface FileCoverage {
	/** Source file path (relative). */
	file: string;
	/** Number of lines (or statements) covered by tests. */
	coveredLines: number;
	/** Total number of coverable lines (or statements). */
	totalLines: number;
	/** Coverage percentage 0-100. */
	percent: number;
}

/** Per-file delta compared against a base. */
export interface FileCoverageDelta extends FileCoverage {
	baseCoveredLines: number | null;
	baseTotalLines: number | null;
	basePercent: number | null;
	/** Signed delta in percentage points (positive = improvement). */
	delta: number | null;
}

/** Aggregated result for a single tool. */
export interface ToolCoverageReport {
	tool: string;
	files: FileCoverageDelta[];
	summary: {
		coveredLines: number;
		totalLines: number;
		percent: number;
		baseCoveredLines: number | null;
		baseTotalLines: number | null;
		basePercent: number | null;
		delta: number | null;
	};
	warnings: string[];
}

/** Full report across all tools. */
export interface CoverageReport {
	tools: ToolCoverageReport[];
	overall: {
		coveredLines: number;
		totalLines: number;
		percent: number;
		basePercent: number | null;
		delta: number | null;
	};
	generatedAt: string;
}

/** Serialisable cache artifact. */
export interface CoverageArtifact {
	tool: string;
	files: FileCoverage[];
	commitSha: string;
	branch: string;
	timestamp: string;
}

/** Parsed input mapping. */
export interface ArtifactInput {
	tool: string;
	path: string;
}
