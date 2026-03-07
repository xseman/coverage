import { parseGoCover } from "./go.js";
import { parseLcov } from "./lcov.js";
import type { FileCoverage } from "./types.js";

export type CoverageParser = (content: string) => FileCoverage[];

const COVERAGE_PARSER_ENTRIES: [string, CoverageParser][] = [
	["lcov", parseLcov],
	["bun", parseLcov],
	["node", parseLcov],
	["go", parseGoCover],
	["gocover", parseGoCover],
];

const COVERAGE_PARSERS = new Map<string, CoverageParser>(COVERAGE_PARSER_ENTRIES);

export function getCoverageParser(tool: string): CoverageParser | undefined {
	return COVERAGE_PARSERS.get(tool);
}

export function getSupportedCoverageTools(): string[] {
	return COVERAGE_PARSER_ENTRIES.map(([tool]) => tool);
}
