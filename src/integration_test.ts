/**
 * Integration tests — spawn real `bun test`, `node --test`, and `go test` to
 * produce authentic coverage artifacts, then feed them through the full pipeline:
 * parse → diff → build report → render markdown.
 *
 * Fixture source lives in src/fixtures/bun/, src/fixtures/node/, and
 * src/fixtures/goproject/. Coverage data is generated on-the-fly via
 * src/fixtures/generate.ts.
 */
import {
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";

import {
	buildFullReport,
	buildToolReport,
	computeFileDiffs,
} from "./diff.js";
import { generateFixtures } from "./fixtures/generate.js";
import type { GeneratedFixtures } from "./fixtures/generate.js";
import { parseGoCover } from "./go.js";
import { parseLcov } from "./lcov.js";
import { renderReport } from "./render.js";
import type {
	CoverageArtifact,
	FileCoverage,
} from "./types.js";

// Raw coverage strings populated by real tool invocations
let F: GeneratedFixtures;

beforeAll(async () => {
	F = await generateFixtures();
});

// ---------------------------------------------------------------------------
// Bun LCOV integration (real `bun test --coverage` output)
// ---------------------------------------------------------------------------

describe("Bun LCOV integration", () => {
	let headFiles: FileCoverage[];
	let baseFiles: FileCoverage[];

	beforeAll(() => {
		headFiles = parseLcov(F.bun.head);
		baseFiles = parseLcov(F.bun.base);
	});

	test("head: parses both source files", () => {
		expect(headFiles).toHaveLength(2);
		const names = headFiles.map((f) => f.file).sort();
		expect(names).toEqual(["calc.ts", "strutil.ts"]);
	});

	test("head: calc.ts has partial coverage (add, subtract, multiply covered; divide, modulo not)", () => {
		const calc = headFiles.find((f) => f.file === "calc.ts")!;
		expect(calc).toBeDefined();
		// 3 of 5 functions covered -> roughly 50-60%
		expect(calc.coveredLines).toBeGreaterThan(0);
		expect(calc.coveredLines).toBeLessThan(calc.totalLines);
		expect(calc.percent).toBeGreaterThan(40);
		expect(calc.percent).toBeLessThan(70);
	});

	test("head: strutil.ts has partial coverage (reverse, capitalize, truncate covered; padLeft not)", () => {
		const strutil = headFiles.find((f) => f.file === "strutil.ts")!;
		expect(strutil).toBeDefined();
		// 3 of 4 functions covered -> roughly 65-85%
		expect(strutil.coveredLines).toBeGreaterThan(0);
		expect(strutil.coveredLines).toBeLessThan(strutil.totalLines);
		expect(strutil.percent).toBeGreaterThan(60);
		expect(strutil.percent).toBeLessThan(90);
	});

	test("base: parses both source files", () => {
		expect(baseFiles).toHaveLength(2);
		const names = baseFiles.map((f) => f.file).sort();
		expect(names).toEqual(["calc.ts", "strutil.ts"]);
	});

	test("base: different functions covered than head", () => {
		const baseCalc = baseFiles.find((f) => f.file === "calc.ts")!;
		const headCalc = headFiles.find((f) => f.file === "calc.ts")!;
		// Base covers add+divide; head covers add+subtract+multiply -> different percentages
		expect(baseCalc.percent).not.toBe(headCalc.percent);

		const baseStr = baseFiles.find((f) => f.file === "strutil.ts")!;
		const headStr = headFiles.find((f) => f.file === "strutil.ts")!;
		// Base covers reverse+padLeft; head covers reverse+capitalize+truncate
		expect(baseStr.percent).not.toBe(headStr.percent);
	});

	test("diff: produces deltas for both files", () => {
		const diffs = computeFileDiffs(headFiles, baseFiles);
		expect(diffs).toHaveLength(2);
		for (const d of diffs) {
			expect(d.delta).not.toBeNull();
			expect(d.basePercent).not.toBeNull();
		}
	});

	test("diff: strutil.ts coverage improved head vs base", () => {
		const diffs = computeFileDiffs(headFiles, baseFiles);
		const strutil = diffs.find((d) => d.file === "strutil.ts")!;
		// Head covers 3/4 funcs (~75%), base covers 2/4 (~53%) -> positive delta
		expect(strutil.delta).toBeGreaterThan(0);
	});

	test("diff: calc.ts coverage changed between head and base", () => {
		const diffs = computeFileDiffs(headFiles, baseFiles);
		const calc = diffs.find((d) => d.file === "calc.ts")!;
		// Different functions covered -> non-zero delta
		expect(calc.delta).not.toBe(0);
	});

	test("buildToolReport: summary aggregates correctly", () => {
		const baseArtifact: CoverageArtifact = {
			tool: "bun",
			files: baseFiles,
			commitSha: "base123",
			branch: "main",
			timestamp: "2026-01-01T00:00:00Z",
		};
		const report = buildToolReport("bun", headFiles, baseArtifact, []);

		// Summary should reflect the 2 files
		expect(report.summary.coveredLines).toBe(
			headFiles.reduce((s, f) => s + f.coveredLines, 0),
		);
		expect(report.summary.totalLines).toBe(
			headFiles.reduce((s, f) => s + f.totalLines, 0),
		);
		expect(report.summary.percent).toBeGreaterThan(0);
		expect(report.summary.percent).toBeLessThan(100);

		// Base present -> delta computed
		expect(report.summary.baseCoveredLines).toBe(
			baseFiles.reduce((s, f) => s + f.coveredLines, 0),
		);
		expect(report.summary.delta).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Go cover profile integration (real `go test -coverprofile` output)
// ---------------------------------------------------------------------------

describe("Go cover profile integration", () => {
	let headFiles: FileCoverage[];
	let baseFiles: FileCoverage[];

	beforeAll(() => {
		headFiles = parseGoCover(F.go.head);
		baseFiles = parseGoCover(F.go.base);
	});

	test("head: parses both Go source files", () => {
		expect(headFiles).toHaveLength(2);
		const names = headFiles.map((f) => f.file).sort();
		expect(names).toEqual([
			"example.com/fixture/calc.go",
			"example.com/fixture/strutil.go",
		]);
	});

	test("head: calc.go — Add, Subtract, Multiply covered; Divide, Modulo not", () => {
		const calc = headFiles.find((f) => f.file === "example.com/fixture/calc.go")!;
		expect(calc).toBeDefined();
		// 3 statements covered (one per simple func), 6 uncovered (Divide+Modulo bodies)
		expect(calc.coveredLines).toBe(3);
		expect(calc.totalLines).toBe(9);
		expect(calc.percent).toBe(33.33);
	});

	test("head: strutil.go — Reverse, Capitalize, Truncate covered; PadLeft not", () => {
		const strutil = headFiles.find((f) => f.file === "example.com/fixture/strutil.go")!;
		expect(strutil).toBeDefined();
		expect(strutil.coveredLines).toBe(8);
		expect(strutil.totalLines).toBe(13);
		expect(strutil.percent).toBe(61.54);
	});

	test("base: parses both Go source files", () => {
		expect(baseFiles).toHaveLength(2);
	});

	test("base: calc.go — Add and Divide covered; Subtract, Multiply, Modulo not", () => {
		const calc = baseFiles.find((f) => f.file === "example.com/fixture/calc.go")!;
		expect(calc).toBeDefined();
		// Add (1 stmt) + Divide non-zero path (2 stmts) = 3 covered
		expect(calc.coveredLines).toBe(3);
		expect(calc.totalLines).toBe(9);
		expect(calc.percent).toBe(33.33);
	});

	test("base: strutil.go — Reverse and PadLeft covered; Capitalize, Truncate not", () => {
		const strutil = baseFiles.find((f) => f.file === "example.com/fixture/strutil.go")!;
		expect(strutil).toBeDefined();
		expect(strutil.coveredLines).toBe(7);
		expect(strutil.totalLines).toBe(13);
		expect(strutil.percent).toBe(53.85);
	});

	test("head: files are sorted alphabetically", () => {
		const paths = headFiles.map((f) => f.file);
		const sorted = [...paths].sort();
		expect(paths).toEqual(sorted);
	});

	test("diff: strutil.go coverage improved (53.85% → 61.54%)", () => {
		const diffs = computeFileDiffs(headFiles, baseFiles);
		const strutil = diffs.find((d) => d.file === "example.com/fixture/strutil.go")!;
		expect(strutil).toBeDefined();
		expect(strutil.delta).toBe(7.69);
		expect(strutil.basePercent).toBe(53.85);
		expect(strutil.percent).toBe(61.54);
	});

	test("diff: calc.go coverage unchanged (33.33% → 33.33%, different stmts)", () => {
		const diffs = computeFileDiffs(headFiles, baseFiles);
		const calc = diffs.find((d) => d.file === "example.com/fixture/calc.go")!;
		expect(calc).toBeDefined();
		expect(calc.delta).toBe(0);
	});

	test("buildToolReport: summary aggregates correctly", () => {
		const baseArtifact: CoverageArtifact = {
			tool: "go",
			files: baseFiles,
			commitSha: "gobase456",
			branch: "main",
			timestamp: "2026-01-01T00:00:00Z",
		};
		const report = buildToolReport("go", headFiles, baseArtifact, []);

		// Head: 3+8 = 11 covered, 9+13 = 22 total -> 50%
		expect(report.summary.coveredLines).toBe(11);
		expect(report.summary.totalLines).toBe(22);
		expect(report.summary.percent).toBe(50);

		// Base: 3+7 = 10 covered, 9+13 = 22 total -> 45.45%
		expect(report.summary.baseCoveredLines).toBe(10);
		expect(report.summary.baseTotalLines).toBe(22);
		expect(report.summary.basePercent).toBe(45.45);

		// Coverage improved overall
		expect(report.summary.delta).toBe(4.55);
	});
});

// ---------------------------------------------------------------------------
// Multi-tool full pipeline
// ---------------------------------------------------------------------------

describe("Multi-tool full pipeline", () => {
	let bunHead: FileCoverage[];
	let bunBase: FileCoverage[];
	let goHead: FileCoverage[];
	let goBase: FileCoverage[];

	beforeAll(() => {
		bunHead = parseLcov(F.bun.head);
		bunBase = parseLcov(F.bun.base);
		goHead = parseGoCover(F.go.head);
		goBase = parseGoCover(F.go.base);
	});

	test("buildFullReport: aggregates both tools", () => {
		const bunArtifact: CoverageArtifact = {
			tool: "bun",
			files: bunBase,
			commitSha: "b1",
			branch: "main",
			timestamp: "2026-01-01T00:00:00Z",
		};
		const goArtifact: CoverageArtifact = {
			tool: "go",
			files: goBase,
			commitSha: "g1",
			branch: "main",
			timestamp: "2026-01-01T00:00:00Z",
		};

		const bunReport = buildToolReport("bun", bunHead, bunArtifact, []);
		const goReport = buildToolReport("go", goHead, goArtifact, []);
		const full = buildFullReport([bunReport, goReport]);

		expect(full.tools).toHaveLength(2);

		// Overall computed from raw line counts, not averaged
		const expectedCovered = bunReport.summary.coveredLines + goReport.summary.coveredLines;
		const expectedTotal = bunReport.summary.totalLines + goReport.summary.totalLines;
		expect(full.overall.coveredLines).toBe(expectedCovered);
		expect(full.overall.totalLines).toBe(expectedTotal);
		expect(full.overall.percent).toBeGreaterThan(0);
		expect(full.overall.percent).toBeLessThan(100);

		// Base present -> delta computed
		expect(full.overall.basePercent).not.toBeNull();
		expect(full.overall.delta).not.toBeNull();
	});

	test("renderReport: produces valid markdown with both tool sections", () => {
		const bunArtifact: CoverageArtifact = {
			tool: "bun",
			files: bunBase,
			commitSha: "b1",
			branch: "main",
			timestamp: "2026-01-01T00:00:00Z",
		};
		const goArtifact: CoverageArtifact = {
			tool: "go",
			files: goBase,
			commitSha: "g1",
			branch: "main",
			timestamp: "2026-01-01T00:00:00Z",
		};

		const bunReport = buildToolReport("bun", bunHead, bunArtifact, []);
		const goReport = buildToolReport("go", goHead, goArtifact, []);
		const full = buildFullReport([bunReport, goReport]);
		const md = renderReport(full, "<!-- cov-e2e -->", true);

		// Structural checks
		expect(md).toStartWith("<!-- cov-e2e -->");
		expect(md).toContain("## Coverage Report");
		expect(md).toContain("Bun Coverage:");
		expect(md).toContain("Go Coverage:");
		expect(md).toContain("**Total Coverage:");
		expect(md).toContain("xseman/coverage");

		// Real file paths from fixtures
		expect(md).toContain("calc.ts");
		expect(md).toContain("strutil.ts");
		expect(md).toContain("example.com/fixture/calc.go");
		expect(md).toContain("example.com/fixture/strutil.go");

		// Delta markers present (strutil.go improved)
		expect(md).toContain("[+]");
	});

	test("renderReport: colorize=off suppresses delta markers", () => {
		const bunReport = buildToolReport("bun", bunHead, null, []);
		const goReport = buildToolReport("go", goHead, null, []);
		const full = buildFullReport([bunReport, goReport]);
		const md = renderReport(full, "<!-- no-color -->", false);

		expect(md).not.toContain("[+]");
		expect(md).not.toContain("[-]");
		expect(md).toContain("Bun Coverage:");
		expect(md).toContain("Go Coverage:");
	});

	test("renderReport: warnings appear in output", () => {
		const bunReport = buildToolReport("bun", [], null, [
			"Artifact file not found: `coverage/lcov.info`",
		]);
		const goReport = buildToolReport("go", [], null, [
			"Failed to parse `coverage.out` as go coverage: unexpected format",
		]);
		const full = buildFullReport([bunReport, goReport]);
		const md = renderReport(full, "<!-- warn -->", true);

		expect(md).toContain("WARNING:");
		expect(md).toContain("Artifact file not found");
		expect(md).toContain("unexpected format");
	});
});

// ---------------------------------------------------------------------------
// Edge cases with real-ish tool output
// ---------------------------------------------------------------------------

describe("Edge cases with real-ish tool output", () => {
	test("LCOV: file with only branch data (no DA lines) uses LH/LF fallback", () => {
		const input = `
TN:
SF:src/generated/schema.ts
BRDA:1,0,0,1
BRDA:1,0,1,0
BRDA:2,1,0,1
BRF:3
BRH:2
LH:15
LF:20
end_of_record
`;
		const result = parseLcov(input);
		expect(result).toHaveLength(1);
		expect(result[0].file).toBe("src/generated/schema.ts");
		expect(result[0].coveredLines).toBe(15);
		expect(result[0].totalLines).toBe(20);
		expect(result[0].percent).toBe(75);
	});

	test("LCOV: multiple records for same file path (should produce separate entries)", () => {
		const input = `
TN:
SF:src/shared.ts
DA:1,1
DA:2,0
DA:3,1
end_of_record
TN:
SF:src/shared.ts
DA:1,1
DA:2,1
DA:3,1
end_of_record
`;
		const result = parseLcov(input);
		expect(result).toHaveLength(2);
		expect(result[0].coveredLines).toBe(2);
		expect(result[1].coveredLines).toBe(3);
	});

	test("Go: mode: atomic with large counts", () => {
		const input = `
mode: atomic
github.com/myorg/app/hot.go:10.1,20.2 5 104857
github.com/myorg/app/hot.go:22.1,30.2 3 0
github.com/myorg/app/cold.go:5.1,8.2 2 0
`;
		const result = parseGoCover(input);
		expect(result).toHaveLength(2);

		const hot = result.find((f) => f.file === "github.com/myorg/app/hot.go")!;
		expect(hot.coveredLines).toBe(5);
		expect(hot.totalLines).toBe(8);

		const cold = result.find((f) => f.file === "github.com/myorg/app/cold.go")!;
		expect(cold.coveredLines).toBe(0);
		expect(cold.totalLines).toBe(2);
		expect(cold.percent).toBe(0);
	});

	test("Go: lines with unusual spacing are still parsed", () => {
		const input = `
mode: set
  github.com/myorg/app/spaced.go:1.1,5.2 3 1  
github.com/myorg/app/spaced.go:7.1,10.2 2 0
`;
		const result = parseGoCover(input);
		expect(result).toHaveLength(1);
		expect(result[0].coveredLines).toBe(3);
		expect(result[0].totalLines).toBe(5);
	});

	test("Go: completely uncovered file produces 0%", () => {
		const input = `
mode: set
github.com/myorg/app/dead.go:1.1,10.2 5 0
github.com/myorg/app/dead.go:12.1,20.2 8 0
github.com/myorg/app/dead.go:22.1,25.2 3 0
`;
		const result = parseGoCover(input);
		expect(result).toHaveLength(1);
		expect(result[0].coveredLines).toBe(0);
		expect(result[0].totalLines).toBe(16);
		expect(result[0].percent).toBe(0);
	});

	test("diff: all-new files (no base) produce null deltas", () => {
		const head: FileCoverage[] = [
			{ file: "brand-new.ts", coveredLines: 10, totalLines: 20, percent: 50 },
			{ file: "also-new.go", coveredLines: 15, totalLines: 15, percent: 100 },
		];
		const diffs = computeFileDiffs(head, []);
		expect(diffs).toHaveLength(2);
		for (const d of diffs) {
			expect(d.delta).toBeNull();
			expect(d.basePercent).toBeNull();
		}
	});

	test("diff: empty head against populated base marks all as deleted", () => {
		const base: FileCoverage[] = [
			{ file: "removed-a.ts", coveredLines: 5, totalLines: 10, percent: 50 },
			{ file: "removed-b.go", coveredLines: 8, totalLines: 10, percent: 80 },
		];
		const diffs = computeFileDiffs([], base);
		expect(diffs).toHaveLength(2);
		for (const d of diffs) {
			expect(d.coveredLines).toBe(0);
			expect(d.totalLines).toBe(0);
			expect(d.percent).toBe(0);
			expect(d.delta).toBeLessThan(0);
		}
	});

	test("full pipeline: empty artifacts still produce valid markdown", () => {
		const bunReport = buildToolReport("bun", [], null, [
			"Artifact file not found: `coverage/lcov.info`",
		]);
		const goReport = buildToolReport("go", [], null, [
			"Artifact file is empty: `coverage.out`",
		]);
		const full = buildFullReport([bunReport, goReport]);
		const md = renderReport(full, "<!-- empty -->", true);

		expect(md).toContain("<!-- empty -->");
		expect(md).toContain("## Coverage Report");
		expect(md).toContain("WARNING:");
		expect(full.overall.percent).toBe(100);
		expect(md).toContain("100.00%");
	});

	test("LCOV: real bun output round-trips through full pipeline", () => {
		const files = parseLcov(F.bun.head);
		const report = buildToolReport("bun", files, null, []);
		const full = buildFullReport([report]);
		const md = renderReport(full, "<!-- rt -->", true);

		for (const f of files) {
			expect(md).toContain(f.file);
		}
		expect(md).toContain("Bun Coverage:");
	});

	test("Go: real output round-trips through full pipeline", () => {
		const files = parseGoCover(F.go.head);
		const report = buildToolReport("go", files, null, []);
		const full = buildFullReport([report]);
		const md = renderReport(full, "<!-- rt-go -->", true);

		for (const f of files) {
			expect(md).toContain(f.file);
		}
		expect(md).toContain("Go Coverage:");
	});
});

// ---------------------------------------------------------------------------
// Node.js LCOV integration (real `node --test --experimental-test-coverage` output)
// ---------------------------------------------------------------------------

describe("Node.js LCOV integration", () => {
	test("Node.js LCOV format is parsed identically to Bun", () => {
		const nodeFiles = parseLcov(F.node.head);
		const bunFiles = parseLcov(F.bun.head);
		// Both use same source logic, so same file count and names
		expect(nodeFiles).toHaveLength(bunFiles.length);
	});

	test("Tool label renders as 'Node Coverage:'", () => {
		const files = parseLcov(F.node.head);
		const report = buildToolReport("node", files, null, []);
		const full = buildFullReport([report]);
		const md = renderReport(full, "<!-- node-test -->", true);

		expect(md).toContain("Node Coverage:");
		expect(md).not.toContain("Bun Coverage:");
		expect(md).not.toContain("Lcov Coverage:");
	});

	test("Node.js works in multi-tool reports", () => {
		const nodeFiles = parseLcov(F.node.head);
		const goFiles = parseGoCover(F.go.head);

		const nodeReport = buildToolReport("node", nodeFiles, null, []);
		const goReport = buildToolReport("go", goFiles, null, []);
		const full = buildFullReport([nodeReport, goReport]);

		expect(full.tools).toHaveLength(2);
		expect(full.tools[0].tool).toBe("node");
		expect(full.tools[1].tool).toBe("go");

		const md = renderReport(full, "<!-- multi -->", true);
		expect(md).toContain("Node Coverage:");
		expect(md).toContain("Go Coverage:");
		expect(md).toContain("**Total Coverage:");
	});

	test("Node.js with base comparison computes deltas", () => {
		const headFiles = parseLcov(F.node.head);
		const baseFiles = parseLcov(F.node.base);

		const baseArtifact: CoverageArtifact = {
			tool: "node",
			files: baseFiles,
			commitSha: "node-base",
			branch: "main",
			timestamp: "2026-01-01T00:00:00Z",
		};

		const report = buildToolReport("node", headFiles, baseArtifact, []);

		// Real Node.js coverage data
		expect(report.summary.coveredLines).toBe(
			headFiles.reduce((s, f) => s + f.coveredLines, 0),
		);
		expect(report.summary.baseCoveredLines).toBe(
			baseFiles.reduce((s, f) => s + f.coveredLines, 0),
		);
		expect(report.summary.delta).not.toBeNull();
	});

	test("Node.js round-trips through full pipeline", () => {
		const files = parseLcov(F.node.head);
		const report = buildToolReport("node", files, null, []);
		const full = buildFullReport([report]);
		const md = renderReport(full, "<!-- node-rt -->", true);

		for (const f of files) {
			expect(md).toContain(f.file);
		}
		expect(md).toContain("Node Coverage:");
		expect(md).toContain("calc.js");
		expect(md).toContain("strutil.js");
	});
});

// ---------------------------------------------------------------------------
// Numeric precision
// ---------------------------------------------------------------------------

describe("Numeric precision", () => {
	test("LCOV percentages are rounded to 2 decimal places", () => {
		// 7/11 = 63.636363...% should round to 63.64%
		const input = `
SF:precision.ts
DA:1,1
DA:2,1
DA:3,0
DA:4,1
DA:5,1
DA:6,0
DA:7,1
DA:8,0
DA:9,1
DA:10,0
DA:11,1
end_of_record
`;
		const result = parseLcov(input);
		expect(result[0].percent).toBe(63.64);
	});

	test("Go percentages are rounded to 2 decimal places", () => {
		// 7/11 statements = 63.636363...% -> 63.64%
		const input = `
mode: set
pkg/x.go:1.1,5.2 3 1
pkg/x.go:6.1,10.2 4 1
pkg/x.go:11.1,14.2 3 0
pkg/x.go:15.1,15.5 1 0
`;
		const result = parseGoCover(input);
		expect(result[0].coveredLines).toBe(7);
		expect(result[0].totalLines).toBe(11);
		expect(result[0].percent).toBe(63.64);
	});

	test("delta precision: small differences are preserved", () => {
		const head: FileCoverage[] = [
			{ file: "x.ts", coveredLines: 7, totalLines: 11, percent: 63.64 },
		];
		const base: FileCoverage[] = [
			{ file: "x.ts", coveredLines: 6, totalLines: 11, percent: 54.55 },
		];
		const diffs = computeFileDiffs(head, base);
		expect(diffs[0].delta).toBe(9.09);
	});

	test("summary percent is recomputed from raw lines, not averaged", () => {
		// 2 files: 1/3 = 33.33%, 9/10 = 90%
		// Average would be 61.67%, but correct aggregation: 10/13 = 76.92%
		const files: FileCoverage[] = [
			{ file: "a.ts", coveredLines: 1, totalLines: 3, percent: 33.33 },
			{ file: "b.ts", coveredLines: 9, totalLines: 10, percent: 90 },
		];
		const report = buildToolReport("bun", files, null, []);
		expect(report.summary.coveredLines).toBe(10);
		expect(report.summary.totalLines).toBe(13);
		expect(report.summary.percent).toBe(76.92);
	});
});
