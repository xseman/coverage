import type { FileCoverage } from "./types.js";

/**
 * Parse a Go coverage profile in the legacy text format produced by:
 *   go test -coverprofile=coverage.out ./...
 * or converted via:
 *   go tool covdata textfmt -i=<dir> -o coverage.out
 *
 * Format:
 *   mode: set|count|atomic
 *   <file>:<startLine>.<startCol>,<endLine>.<endCol> <numStatements> <count>
 *
 * We aggregate statements per file: totalLines += numStatements,
 * coveredLines += numStatements when count > 0.
 */
export function parseGoCover(content: string): FileCoverage[] {
	const fileMap = new Map<string, { covered: number; total: number; }>();

	const lines = content.split("\n");

	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;
		// Skip the mode line
		if (line.startsWith("mode:")) continue;

		// Expected: file.go:start.col,end.col numStmts count
		// Example:  mydomain.com/greetings/greetings.go:3.23,5.2 1 1
		const spaceIdx = line.lastIndexOf(" ");
		if (spaceIdx === -1) continue;
		const countStr = line.slice(spaceIdx + 1);
		const rest = line.slice(0, spaceIdx);

		const spaceIdx2 = rest.lastIndexOf(" ");
		if (spaceIdx2 === -1) continue;
		const numStmtsStr = rest.slice(spaceIdx2 + 1);
		const fileRange = rest.slice(0, spaceIdx2);

		const colonIdx = fileRange.indexOf(":");
		if (colonIdx === -1) continue;
		const file = fileRange.slice(0, colonIdx);

		const numStmts = parseInt(numStmtsStr, 10);
		const count = parseInt(countStr, 10);

		if (isNaN(numStmts) || isNaN(count)) continue;

		let entry = fileMap.get(file);
		if (!entry) {
			entry = { covered: 0, total: 0 };
			fileMap.set(file, entry);
		}

		entry.total += numStmts;
		if (count > 0) {
			entry.covered += numStmts;
		}
	}

	const results: FileCoverage[] = [];
	for (const [file, { covered, total }] of fileMap) {
		const percent = total > 0 ? Math.round((covered / total) * 10000) / 100 : 100;
		results.push({ file, coveredLines: covered, totalLines: total, percent });
	}

	// Sort by file path for stable output
	results.sort((a, b) => a.file.localeCompare(b.file));
	return results;
}
