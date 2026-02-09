import {
	describe,
	expect,
	test,
} from "bun:test";

import {
	buildFullReport,
	buildToolReport,
} from "./diff";
import { renderReport } from "./render";
import type { CommitInfo } from "./render";
import type {
	CoverageArtifact,
	FileCoverage,
} from "./types";

describe("renderReport", () => {
	test("renders a complete report with marker", () => {
		const head: FileCoverage[] = [
			{ file: "src/index.ts", coveredLines: 8, totalLines: 10, percent: 80 },
			{ file: "src/utils.ts", coveredLines: 10, totalLines: 10, percent: 100 },
		];
		const base: CoverageArtifact = {
			tool: "bun",
			files: [
				{ file: "src/index.ts", coveredLines: 7, totalLines: 10, percent: 70 },
				{ file: "src/utils.ts", coveredLines: 9, totalLines: 10, percent: 90 },
			],
			commitSha: "abc",
			branch: "main",
			timestamp: "2025-01-01T00:00:00Z",
		};
		const toolReport = buildToolReport("bun", head, base, []);
		const fullReport = buildFullReport([toolReport]);
		const md = renderReport(fullReport, "<!-- test-marker -->", true);

		expect(md).toContain("<!-- test-marker -->");
		expect(md).toContain("## Coverage Report");
		expect(md).toContain("src/index.ts");
		expect(md).toContain("src/utils.ts");
		expect(md).toContain("[+]"); // positive delta
		expect(md).toContain("Bun Coverage: 90.00%");
		expect(md).toContain("xseman/coverage");
		// Single tool — no separate "Total Coverage" line
		expect(md).not.toContain("**Total Coverage:");
	});

	test("renders without color when colorize is off", () => {
		const head: FileCoverage[] = [
			{ file: "a.ts", coveredLines: 5, totalLines: 10, percent: 50 },
		];
		const toolReport = buildToolReport("go", head, null, []);
		const fullReport = buildFullReport([toolReport]);
		const md = renderReport(fullReport, "<!-- m -->", false);

		expect(md).not.toContain("[+]");
		expect(md).not.toContain("[-]");
		expect(md).toContain("Go Coverage: 50.00%");
	});

	test("renders warning rows", () => {
		const toolReport = buildToolReport("bun", [], null, [
			"Artifact file not found: `coverage/lcov.info`",
		]);
		const fullReport = buildFullReport([toolReport]);
		const md = renderReport(fullReport, "<!-- m -->", true);

		expect(md).toContain("WARNING:");
		expect(md).toContain("Artifact file not found");
	});

	test("renders overall total when multiple tools present", () => {
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
		const fullReport = buildFullReport([t1, t2]);
		const md = renderReport(fullReport, "<!-- m -->", true);

		expect(md).toContain("Bun Coverage: 50.00%");
		expect(md).toContain("Go Coverage: 80.00%");
		expect(md).toContain("**Total Coverage: 65.00%**");
	});

	test("renders commit link when commitInfo is provided", () => {
		const head: FileCoverage[] = [
			{ file: "src/index.ts", coveredLines: 8, totalLines: 10, percent: 80 },
		];
		const toolReport = buildToolReport("bun", head, null, []);
		const fullReport = buildFullReport([toolReport]);
		const commitInfo: CommitInfo = {
			sha: "abc1234567890",
			owner: "myorg",
			repo: "myrepo",
		};
		const md = renderReport(fullReport, "<!-- m -->", true, commitInfo);

		expect(md).toContain("[Commit abc1234]");
		expect(md).toContain("https://github.com/myorg/myrepo/commit/abc1234567890");
	});

	test("omits commit link when commitInfo is not provided", () => {
		const head: FileCoverage[] = [
			{ file: "src/index.ts", coveredLines: 8, totalLines: 10, percent: 80 },
		];
		const toolReport = buildToolReport("bun", head, null, []);
		const fullReport = buildFullReport([toolReport]);
		const md = renderReport(fullReport, "<!-- m -->", true);

		expect(md).not.toContain("[Commit");
	});
});
