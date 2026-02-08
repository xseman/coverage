import {
	describe,
	expect,
	test,
} from "bun:test";

import {
	buildFullReport,
	buildToolReport,
	computeFileDiffs,
} from "./diff";
import type {
	CoverageArtifact,
	FileCoverage,
} from "./types";

describe("computeFileDiffs", () => {
	test("computes deltas against base", () => {
		const head: FileCoverage[] = [
			{ file: "a.ts", coveredLines: 8, totalLines: 10, percent: 80 },
			{ file: "b.ts", coveredLines: 5, totalLines: 10, percent: 50 },
		];
		const base: FileCoverage[] = [
			{ file: "a.ts", coveredLines: 7, totalLines: 10, percent: 70 },
			{ file: "b.ts", coveredLines: 6, totalLines: 10, percent: 60 },
		];

		const result = computeFileDiffs(head, base);
		expect(result).toHaveLength(2);

		const a = result.find((f) => f.file === "a.ts")!;
		expect(a.delta).toBe(10);
		expect(a.basePercent).toBe(70);

		const b = result.find((f) => f.file === "b.ts")!;
		expect(b.delta).toBe(-10);
		expect(b.basePercent).toBe(60);
	});

	test("handles null base (no comparison)", () => {
		const head: FileCoverage[] = [
			{ file: "new.ts", coveredLines: 5, totalLines: 10, percent: 50 },
		];
		const result = computeFileDiffs(head, null);
		expect(result).toHaveLength(1);
		expect(result[0].delta).toBeNull();
		expect(result[0].basePercent).toBeNull();
	});

	test("includes deleted files from base", () => {
		const head: FileCoverage[] = [
			{ file: "kept.ts", coveredLines: 5, totalLines: 10, percent: 50 },
		];
		const base: FileCoverage[] = [
			{ file: "kept.ts", coveredLines: 5, totalLines: 10, percent: 50 },
			{ file: "deleted.ts", coveredLines: 8, totalLines: 10, percent: 80 },
		];
		const result = computeFileDiffs(head, base);
		expect(result).toHaveLength(2);
		const deleted = result.find((f) => f.file === "deleted.ts")!;
		expect(deleted.delta).toBe(-80);
		expect(deleted.percent).toBe(0);
	});

	test("new files in head show null delta", () => {
		const head: FileCoverage[] = [
			{ file: "new.ts", coveredLines: 10, totalLines: 10, percent: 100 },
		];
		const base: FileCoverage[] = [];
		const result = computeFileDiffs(head, base);
		expect(result).toHaveLength(1);
		expect(result[0].delta).toBeNull();
	});
});

describe("buildToolReport", () => {
	test("builds report with summary", () => {
		const headFiles: FileCoverage[] = [
			{ file: "a.ts", coveredLines: 8, totalLines: 10, percent: 80 },
			{ file: "b.ts", coveredLines: 5, totalLines: 10, percent: 50 },
		];
		const report = buildToolReport("bun", headFiles, null, []);
		expect(report.tool).toBe("bun");
		expect(report.summary.coveredLines).toBe(13);
		expect(report.summary.totalLines).toBe(20);
		expect(report.summary.percent).toBe(65);
		expect(report.summary.delta).toBeNull();
	});

	test("computes summary delta with base artifact", () => {
		const head: FileCoverage[] = [
			{ file: "a.ts", coveredLines: 9, totalLines: 10, percent: 90 },
		];
		const base: CoverageArtifact = {
			tool: "bun",
			files: [{ file: "a.ts", coveredLines: 7, totalLines: 10, percent: 70 }],
			commitSha: "abc123",
			branch: "main",
			timestamp: "2025-01-01T00:00:00Z",
		};
		const report = buildToolReport("bun", head, base, []);
		expect(report.summary.delta).toBe(20);
		expect(report.summary.basePercent).toBe(70);
	});
});

describe("buildFullReport", () => {
	test("aggregates across tools", () => {
		const t1 = buildToolReport(
			"bun",
			[{ file: "a.ts", coveredLines: 5, totalLines: 10, percent: 50 }],
			null,
			[],
		);
		const t2 = buildToolReport(
			"go",
			[{ file: "b.go", coveredLines: 8, totalLines: 10, percent: 80 }],
			null,
			[],
		);
		const report = buildFullReport([t1, t2]);
		expect(report.overall.coveredLines).toBe(13);
		expect(report.overall.totalLines).toBe(20);
		expect(report.overall.percent).toBe(65);
		expect(report.tools).toHaveLength(2);
	});
});
