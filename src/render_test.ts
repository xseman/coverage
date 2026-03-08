import {
	describe,
	expect,
	test,
} from "bun:test";

import {
	buildFullReport,
	buildToolReport,
} from "./diff";
import type {
	CommitInfo,
	EmbeddedCoverageData,
} from "./render";
import {
	embedCoverageData,
	extractCoverageData,
	renderReport,
} from "./render";
import type {
	CoverageArtifact,
	FileCoverage,
	ToolCoverageReport,
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
		expect(md).toContain("Project coverage is 90.00%.");
		expect(md).toContain("src/index.ts");
		expect(md).toContain("src/utils.ts");
		expect(md).toContain("[+]"); // positive delta
		expect(md).toContain("Bun Coverage: 90.00%");
		expect(md).toContain("xseman/coverage");
		// Coverage Diff table
		expect(md).toContain("Coverage Diff");
		expect(md).toContain("```diff");
		expect(md).toContain("@@");
		expect(md).toContain("Coverage");
		expect(md).toContain("Files");
		expect(md).toContain("Lines");
		expect(md).toContain("Hits");
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
		expect(md).toContain("Project coverage is 50.00%.");
		// No base — no diff table, but note about missing baseline
		expect(md).not.toContain("Coverage Diff");
		expect(md).toContain("No cached baseline for **go**");
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

	test("omits diff table when overall baseline is incomplete", () => {
		const withBase = buildToolReport(
			"bun",
			[{ file: "a.ts", coveredLines: 8, totalLines: 10, percent: 80 }],
			{
				tool: "bun",
				files: [{ file: "a.ts", coveredLines: 7, totalLines: 10, percent: 70 }],
				commitSha: "abc123",
				branch: "main",
				timestamp: "2025-01-01T00:00:00Z",
			},
			[],
		);
		const withoutBase = buildToolReport(
			"go",
			[{ file: "b.go", coveredLines: 8, totalLines: 10, percent: 80 }],
			null,
			[],
		);
		const fullReport = buildFullReport([withBase, withoutBase]);
		const md = renderReport(fullReport, "<!-- m -->", true);

		expect(md).not.toContain("Coverage Diff");
		expect(md).toContain("Bun Coverage: 80.00% [+] +10.00%");
		expect(md).toContain("Go Coverage: 80.00%");
		// Should note which tool is missing baseline
		expect(md).toContain("No cached baseline for **go**");
		expect(md).not.toContain("**bun**");
	});

	test("shows missing-baseline note for single tool without base", () => {
		const report = buildToolReport(
			"go",
			[{ file: "b.go", coveredLines: 8, totalLines: 10, percent: 80 }],
			null,
			[],
		);
		const fullReport = buildFullReport([report]);
		const md = renderReport(fullReport, "<!-- m -->", true);

		expect(md).toContain("No cached baseline for **go**");
		expect(md).toContain("seed the cache");
	});

	test("omits missing-baseline note when all tools have base data", () => {
		const report = buildToolReport(
			"bun",
			[{ file: "a.ts", coveredLines: 8, totalLines: 10, percent: 80 }],
			{
				tool: "bun",
				files: [{ file: "a.ts", coveredLines: 7, totalLines: 10, percent: 70 }],
				commitSha: "abc",
				branch: "main",
				timestamp: "2025-01-01T00:00:00Z",
			},
			[],
		);
		const fullReport = buildFullReport([report]);
		const md = renderReport(fullReport, "<!-- m -->", true);

		expect(md).not.toContain("No cached baseline");
	});

	test("renders project coverage with base and head commit links", () => {
		const head: FileCoverage[] = [
			{ file: "src/index.ts", coveredLines: 8, totalLines: 10, percent: 80 },
		];
		const base: CoverageArtifact = {
			tool: "bun",
			files: [{ file: "src/index.ts", coveredLines: 7, totalLines: 10, percent: 70 }],
			commitSha: "base123",
			branch: "main",
			timestamp: "2025-01-01T00:00:00Z",
		};
		const toolReport = buildToolReport("bun", head, base, []);
		const fullReport = buildFullReport([toolReport]);
		const commitInfo: CommitInfo = {
			sha: "abc1234567890",
			baseSha: "def9876543210",
			owner: "myorg",
			repo: "myrepo",
		};
		const md = renderReport(fullReport, "<!-- m -->", true, commitInfo);

		expect(md).toContain("Project coverage is 80.00%.");
		expect(md).toContain("Comparing base ([`def9876`]");
		expect(md).toContain("to head ([`abc1234`]");
		expect(md).toContain("https://github.com/myorg/myrepo/commit/def9876543210");
		expect(md).toContain("https://github.com/myorg/myrepo/commit/abc1234567890");
	});

	test("renders commit link without base when baseSha is absent", () => {
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

		expect(md).toContain("Project coverage is 80.00%.");
		expect(md).toContain("Commit [`abc1234`]");
		expect(md).toContain("https://github.com/myorg/myrepo/commit/abc1234567890");
		expect(md).not.toContain("Comparing base");
	});

	test("renders project coverage without commit info", () => {
		const head: FileCoverage[] = [
			{ file: "a.ts", coveredLines: 5, totalLines: 10, percent: 50 },
		];
		const toolReport = buildToolReport("bun", head, null, []);
		const fullReport = buildFullReport([toolReport]);
		const md = renderReport(fullReport, "<!-- m -->", true);

		expect(md).toContain("Project coverage is 50.00%.");
		expect(md).not.toContain("Commit");
		expect(md).not.toContain("Comparing");
	});

	test("coverage diff table shows correct values", () => {
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
		const md = renderReport(fullReport, "<!-- m -->", true);

		// Diff table header
		expect(md).toContain("@@");
		expect(md).toContain("Coverage Diff");
		expect(md).toContain("base");
		expect(md).toContain("head");
		expect(md).toContain("+/-");
		// Data values
		expect(md).toContain("80.00%"); // base coverage
		expect(md).toContain("90.00%"); // head coverage
		expect(md).toContain("+10.00%"); // coverage delta
		// File/line/hit counts
		expect(md).toContain("Hits");
		expect(md).toContain("16"); // baseCovered
		expect(md).toContain("18"); // headCovered
		expect(md).toContain("+2"); // hit delta
	});

	test("coverage diff table uses + prefix on hits when coverage improves", () => {
		const head: FileCoverage[] = [
			{ file: "a.ts", coveredLines: 9, totalLines: 10, percent: 90 },
		];

		const base: CoverageArtifact = {
			tool: "bun",
			files: [{ file: "a.ts", coveredLines: 7, totalLines: 10, percent: 70 }],
			commitSha: "abc",
			branch: "main",
			timestamp: "2025-01-01T00:00:00Z",
		};

		const toolReport = buildToolReport("bun", head, base, []);
		const fullReport = buildFullReport([toolReport]);
		const md = renderReport(fullReport, "<!-- m -->", true);

		// Hits row should start with "+" for improvement
		const diffBlock = md.split("```diff")[1].split("```")[0];
		const hitsLine = diffBlock.split("\n").find((l) => l.includes("Hits"))!;
		expect(hitsLine.startsWith("+")).toBe(true);
	});

	test("coverage diff table uses - prefix on hits when coverage decreases", () => {
		const head: FileCoverage[] = [
			{ file: "a.ts", coveredLines: 5, totalLines: 10, percent: 50 },
		];

		const base: CoverageArtifact = {
			tool: "bun",
			files: [{ file: "a.ts", coveredLines: 7, totalLines: 10, percent: 70 }],
			commitSha: "abc",
			branch: "main",
			timestamp: "2025-01-01T00:00:00Z",
		};

		const toolReport = buildToolReport("bun", head, base, []);
		const fullReport = buildFullReport([toolReport]);
		const md = renderReport(fullReport, "<!-- m -->", true);

		const diffBlock = md.split("```diff")[1].split("```")[0];
		const hitsLine = diffBlock.split("\n").find((l) => l.includes("Hits"))!;
		expect(hitsLine.startsWith("-")).toBe(true);
	});

	test("coverage diff table renders unchanged values explicitly", () => {
		const head: FileCoverage[] = [
			{ file: "a.ts", coveredLines: 7, totalLines: 10, percent: 70 },
			{ file: "b.ts", coveredLines: 9, totalLines: 10, percent: 90 },
		];

		const base: CoverageArtifact = {
			tool: "bun",
			files: [
				{ file: "a.ts", coveredLines: 7, totalLines: 10, percent: 70 },
				{ file: "b.ts", coveredLines: 9, totalLines: 10, percent: 90 },
			],
			commitSha: "abc",
			branch: "main",
			timestamp: "2025-01-01T00:00:00Z",
		};

		const toolReport = buildToolReport("bun", head, base, []);
		const fullReport = buildFullReport([toolReport]);
		const md = renderReport(fullReport, "<!-- m -->", true);

		const diffBlock = md.split("```diff")[1].split("```")[0];
		expect(diffBlock).toContain("0.00%");
		expect(diffBlock).toContain("Files");
		expect(diffBlock).toContain("Lines");
		expect(diffBlock).toContain("Hits");
		expect(diffBlock).toMatch(/Files\s+2\s+2\s+0/);
		expect(diffBlock).toMatch(/Lines\s+20\s+20\s+0/);
		expect(diffBlock).toMatch(/Hits\s+16\s+16\s+0/);
	});

	test("coverage diff table header columns align with data columns", () => {
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
		const md = renderReport(fullReport, "<!-- m -->", true);
		const diffBlock = md.split("```diff")[1].split("```")[0];
		const lines = diffBlock.trim().split("\n");
		const headerLine = lines[1].slice(2, -2);
		const coverageLine = lines[2];

		expect(headerLine.indexOf("base")).toBe(coverageLine.indexOf("80.00%"));
		expect(headerLine.indexOf("head")).toBe(coverageLine.indexOf("90.00%"));
		expect(headerLine.indexOf("+/-")).toBe(coverageLine.indexOf("+10.00%"));
	});
});

describe("embedCoverageData / extractCoverageData", () => {
	test("round-trips tool reports through embed and extract", () => {
		const report = buildToolReport(
			"bun",
			[{ file: "a.ts", coveredLines: 8, totalLines: 10, percent: 80 }],
			null,
			[],
		);
		const data: EmbeddedCoverageData = { tools: [report], baseSha: "abc123" };
		const markdown = embedCoverageData("## Report\nsome content", data);
		const extracted = extractCoverageData(markdown);

		expect(extracted).not.toBeNull();
		expect(extracted!.tools).toHaveLength(1);
		expect(extracted!.tools[0].tool).toBe("bun");
		expect(extracted!.tools[0].summary.percent).toBe(80);
		expect(extracted!.baseSha).toBe("abc123");
	});

	test("returns null when no embedded data present", () => {
		expect(extractCoverageData("## Report\nno data here")).toBeNull();
	});

	test("returns null for malformed embedded data", () => {
		expect(extractCoverageData("<!-- coverage-data:not-valid-base64!!! -->")).toBeNull();
	});

	test("renderReport output contains extractable data", () => {
		const head: FileCoverage[] = [
			{ file: "a.ts", coveredLines: 5, totalLines: 10, percent: 50 },
		];
		const report = buildToolReport("bun", head, null, []);
		const fullReport = buildFullReport([report]);
		const md = renderReport(fullReport, "<!-- m -->", true);

		const extracted = extractCoverageData(md);
		expect(extracted).not.toBeNull();
		expect(extracted!.tools).toHaveLength(1);
		expect(extracted!.tools[0].tool).toBe("bun");
	});
});

describe("merge workflow", () => {
	test("second workflow merges stored tool into combined report", () => {
		// Simulate first workflow: Bun produces a comment
		const bunReport = buildToolReport(
			"bun",
			[{ file: "a.ts", coveredLines: 8, totalLines: 10, percent: 80 }],
			null,
			[],
		);
		const firstReport = buildFullReport([bunReport]);
		const firstMd = renderReport(firstReport, "<!-- m -->", true);

		// Simulate second workflow: Go extracts stored Bun data, merges
		const stored = extractCoverageData(firstMd);
		expect(stored).not.toBeNull();

		const goReport = buildToolReport(
			"go",
			[{ file: "b.go", coveredLines: 6, totalLines: 10, percent: 60 }],
			null,
			[],
		);

		// Merge: current tool reports + stored tools not in current run
		const mergedTools: ToolCoverageReport[] = [goReport];
		const currentTools = new Set(mergedTools.map((r) => r.tool));
		for (const prev of stored!.tools) {
			if (!currentTools.has(prev.tool)) {
				mergedTools.push(prev);
			}
		}

		const mergedReport = buildFullReport(mergedTools);
		const mergedMd = renderReport(mergedReport, "<!-- m -->", true);

		// Should contain both tools
		expect(mergedMd).toContain("Go Coverage: 60.00%");
		expect(mergedMd).toContain("Bun Coverage: 80.00%");
		expect(mergedMd).toContain("**Total Coverage: 70.00%**");

		// Embedded data should contain both tools
		const reExtracted = extractCoverageData(mergedMd);
		expect(reExtracted!.tools).toHaveLength(2);
	});

	test("current run overrides stored tool with same name", () => {
		// First run: Bun at 80%
		const bunOld = buildToolReport(
			"bun",
			[{ file: "a.ts", coveredLines: 8, totalLines: 10, percent: 80 }],
			null,
			[],
		);
		const firstReport = buildFullReport([bunOld]);
		const firstMd = renderReport(firstReport, "<!-- m -->", true);

		// Second run: Bun at 90% (same tool, new data)
		const stored = extractCoverageData(firstMd)!;
		const bunNew = buildToolReport(
			"bun",
			[{ file: "a.ts", coveredLines: 9, totalLines: 10, percent: 90 }],
			null,
			[],
		);

		const mergedTools: ToolCoverageReport[] = [bunNew];
		const currentTools = new Set(mergedTools.map((r) => r.tool));
		for (const prev of stored.tools) {
			if (!currentTools.has(prev.tool)) {
				mergedTools.push(prev);
			}
		}

		expect(mergedTools).toHaveLength(1);
		expect(mergedTools[0].summary.percent).toBe(90);
	});

	test("merge preserves baseSha from stored data when current has none", () => {
		const report = buildToolReport(
			"bun",
			[{ file: "a.ts", coveredLines: 8, totalLines: 10, percent: 80 }],
			null,
			[],
		);
		const data: EmbeddedCoverageData = { tools: [report], baseSha: "base123" };
		const md = embedCoverageData("## Report", data);

		const extracted = extractCoverageData(md)!;
		expect(extracted.baseSha).toBe("base123");
	});
});
