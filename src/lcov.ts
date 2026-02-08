import type { FileCoverage } from "./types.js";

/**
 * Parse an LCOV-format coverage report (as produced by `bun test --coverage --coverage-reporter=lcov`).
 *
 * LCOV record structure:
 *   SF:<source file>
 *   DA:<line number>,<execution count>
 *   LH:<lines hit>
 *   LF:<lines found>
 *   end_of_record
 *
 * We derive per-file covered/total from DA lines so we aren't dependent on
 * LH/LF being present (some emitters omit them).
 */
export function parseLcov(content: string): FileCoverage[] {
	const results: FileCoverage[] = [];
	const records = content.split("end_of_record");

	for (const record of records) {
		const trimmed = record.trim();
		if (!trimmed) continue;

		const lines = trimmed.split("\n").map((l) => l.trim());

		let file: string | null = null;
		let coveredLines = 0;
		let totalLines = 0;

		// Track LH/LF if provided
		let lhProvided: number | null = null;
		let lfProvided: number | null = null;

		for (const line of lines) {
			if (line.startsWith("SF:")) {
				file = line.slice(3).trim();
			} else if (line.startsWith("DA:")) {
				// DA:<line>,<count>[,<checksum>]
				const parts = line.slice(3).split(",");
				if (parts.length >= 2) {
					totalLines++;
					const countStr = parts[1];
					if (countStr !== undefined) {
						const count = parseInt(countStr, 10);
						if (!isNaN(count) && count > 0) {
							coveredLines++;
						}
					}
				}
			} else if (line.startsWith("LH:")) {
				lhProvided = parseInt(line.slice(3), 10);
			} else if (line.startsWith("LF:")) {
				lfProvided = parseInt(line.slice(3), 10);
			}
		}

		if (!file) continue;

		// Prefer DA-derived counts, but if no DA lines found, fall back to LH/LF
		if (totalLines === 0 && lfProvided !== null) {
			totalLines = lfProvided;
			coveredLines = lhProvided ?? 0;
		}

		const percent = totalLines > 0
			? Math.round((coveredLines / totalLines) * 10000) / 100
			: 100;

		results.push({ file, coveredLines, totalLines, percent });
	}

	return results;
}
