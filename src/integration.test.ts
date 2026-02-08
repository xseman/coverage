/**
 * Integration tests — feed realistic Bun (LCOV) and Go coverage tool outputs
 * through the full pipeline: parse → diff → build report → render markdown.
 *
 * Fixture files live in src/fixtures/ and mimic real `bun test --coverage
 * --coverage-reporter=lcov` and `go test -coverprofile=…` output.
 */
import {
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
	buildFullReport,
	buildToolReport,
	computeFileDiffs,
} from "./diff";
import { parseGoCover } from "./go";
import { parseLcov } from "./lcov";
import { renderReport } from "./render";
import type {
	CoverageArtifact,
	FileCoverage,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────────────

const FIXTURES = join(import.meta.dir, "fixtures");
const read = (name: string) => readFileSync(join(FIXTURES, name), "utf-8");

// ── Pre-computed expectations ───────────────────────────────────────
// Manually counted from the fixture files so the tests are deterministic.

/**
 * bun-head.lcov expected per-file results (DA-line counting):
 *   Button.tsx     : 18 covered / 30 total = 60%
 *   format.ts      : 30 covered / 35 total ≈ 85.71%
 *   client.ts      : 48 covered / 70 total ≈ 68.57%
 *   useAuth.ts     : 48 covered / 50 total = 96%
 *   store/index.ts : 45 covered / 45 total = 100%
 */
const BUN_HEAD_EXPECTED: Record<string, { covered: number; total: number; pct: number; }> = {
	"src/components/Button.tsx": { covered: 19, total: 30, pct: 63.33 },
	"src/utils/format.ts": { covered: 31, total: 35, pct: 88.57 },
	"src/api/client.ts": { covered: 49, total: 70, pct: 70 },
	"src/hooks/useAuth.ts": { covered: 48, total: 50, pct: 96 },
	"src/store/index.ts": { covered: 45, total: 45, pct: 100 },
};

/**
 * bun-base.lcov expected per-file results (DA-line counting):
 *   Button.tsx            : 16/24 = 66.67%
 *   format.ts             : 25/29 ≈ 86.21%
 *   client.ts             : 34/40 = 85%
 *   useAuth.ts            : 44/44 = 100%
 *   store/index.ts        : 45/45 = 100%
 *   legacy/deprecated.ts  :  5/10 = 50%
 */
const BUN_BASE_EXPECTED: Record<string, { covered: number; total: number; pct: number; }> = {
	"src/components/Button.tsx": { covered: 19, total: 24, pct: 79.17 },
	"src/utils/format.ts": { covered: 27, total: 29, pct: 93.1 },
	"src/api/client.ts": { covered: 35, total: 40, pct: 87.5 },
	"src/hooks/useAuth.ts": { covered: 44, total: 44, pct: 100 },
	"src/store/index.ts": { covered: 45, total: 45, pct: 100 },
	"src/legacy/deprecated.ts": { covered: 5, total: 10, pct: 50 },
};

// ═════════════════════════════════════════════════════════════════════
// §1  Bun / LCOV — parse real tool output
// ═════════════════════════════════════════════════════════════════════

describe("Bun LCOV integration", () => {
	let headFiles: FileCoverage[];
	let baseFiles: FileCoverage[];

	beforeAll(() => {
		headFiles = parseLcov(read("bun-head.lcov"));
		baseFiles = parseLcov(read("bun-base.lcov"));
	});

	// ── Parsing ─────────────────────────────────────────────────────

	test("head: parses all 5 files", () => {
		expect(headFiles).toHaveLength(5);
	});

	test("head: every file matches expected covered/total/percent", () => {
		for (const f of headFiles) {
			const exp = BUN_HEAD_EXPECTED[f.file];
			expect(exp).toBeDefined();
			expect(f.coveredLines).toBe(exp.covered);
			expect(f.totalLines).toBe(exp.total);
			expect(f.percent).toBe(exp.pct);
		}
	});

	test("base: parses all 6 files (includes legacy/deprecated.ts)", () => {
		expect(baseFiles).toHaveLength(6);
	});

	test("base: every file matches expected covered/total/percent", () => {
		for (const f of baseFiles) {
			const exp = BUN_BASE_EXPECTED[f.file];
			expect(exp).toBeDefined();
			expect(f.coveredLines).toBe(exp.covered);
			expect(f.totalLines).toBe(exp.total);
			expect(f.percent).toBe(exp.pct);
		}
	});

	// ── Diffing ─────────────────────────────────────────────────────

	test("diff: detects deleted file from base (legacy/deprecated.ts)", () => {
		const diffs = computeFileDiffs(headFiles, baseFiles);
		const deleted = diffs.find((d) => d.file === "src/legacy/deprecated.ts");
		expect(deleted).toBeDefined();
		expect(deleted!.coveredLines).toBe(0);
		expect(deleted!.totalLines).toBe(0);
		expect(deleted!.percent).toBe(0);
		expect(deleted!.basePercent).toBe(50);
		expect(deleted!.delta).toBe(-50);
	});

	test("diff: Button.tsx coverage decreased (79.17% → 63.33%)", () => {
		const diffs = computeFileDiffs(headFiles, baseFiles);
		const button = diffs.find((d) => d.file === "src/components/Button.tsx");
		expect(button).toBeDefined();
		expect(button!.percent).toBe(63.33);
		expect(button!.basePercent).toBe(79.17);
		expect(button!.delta).toBeLessThan(0);
		expect(button!.delta).toBeCloseTo(-15.84, 1);
	});

	test("diff: client.ts coverage decreased (87.5% → 70%)", () => {
		const diffs = computeFileDiffs(headFiles, baseFiles);
		const client = diffs.find((d) => d.file === "src/api/client.ts");
		expect(client).toBeDefined();
		expect(client!.delta).toBeLessThan(0);
		expect(client!.delta).toBeCloseTo(-17.5, 1);
	});

	test("diff: useAuth.ts stayed at ~100% → 96% (slight decrease)", () => {
		const diffs = computeFileDiffs(headFiles, baseFiles);
		const auth = diffs.find((d) => d.file === "src/hooks/useAuth.ts");
		expect(auth).toBeDefined();
		expect(auth!.basePercent).toBe(100);
		expect(auth!.percent).toBe(96);
		expect(auth!.delta).toBe(-4);
	});

	test("diff: store/index.ts unchanged at 100%", () => {
		const diffs = computeFileDiffs(headFiles, baseFiles);
		const store = diffs.find((d) => d.file === "src/store/index.ts");
		expect(store).toBeDefined();
		expect(store!.delta).toBe(0);
	});

	// ── Report building ─────────────────────────────────────────────

	test("buildToolReport: summary aggregates correctly", () => {
		const baseArtifact: CoverageArtifact = {
			tool: "bun",
			files: baseFiles,
			commitSha: "base123",
			branch: "main",
			timestamp: "2026-01-01T00:00:00Z",
		};
		const report = buildToolReport("bun", headFiles, baseArtifact, []);

		// Head totals: 19+31+49+48+45 = 192 covered, 30+35+70+50+45 = 230 total
		expect(report.summary.coveredLines).toBe(192);
		expect(report.summary.totalLines).toBe(230);
		expect(report.summary.percent).toBeCloseTo(83.48, 1);

		// Base totals: 19+27+35+44+45+5 = 175 covered, 24+29+40+44+45+10 = 192 total
		expect(report.summary.baseCoveredLines).toBe(175);
		expect(report.summary.baseTotalLines).toBe(192);
		expect(report.summary.basePercent).toBeCloseTo(91.15, 0);

		// Delta is negative (overall coverage dropped)
		expect(report.summary.delta).toBeLessThan(0);
	});

	test("buildToolReport: includes deleted file in per-file list", () => {
		const baseArtifact: CoverageArtifact = {
			tool: "bun",
			files: baseFiles,
			commitSha: "base123",
			branch: "main",
			timestamp: "2026-01-01T00:00:00Z",
		};
		const report = buildToolReport("bun", headFiles, baseArtifact, []);
		// 5 head files + 1 deleted file = 6
		expect(report.files).toHaveLength(6);
	});
});

// ═════════════════════════════════════════════════════════════════════
// §2  Go — parse real tool output
// ═════════════════════════════════════════════════════════════════════

/**
 * go-head.out expected per-file (statement counting):
 *   cmd/server/main.go         : 13 covered / 21 total = 61.90%
 *   internal/auth/jwt.go       : 29 covered / 37 total = 78.38%  (8+8+8+5=29, total 8+8+8+8+5=37)
 *   internal/auth/middleware.go : 23 covered / 28 total = 82.14%  (7+8+8=23, total 7+8+8+5=28)
 *   internal/db/postgres.go    : 34 covered / 48 total = 70.83%  (8+13+13=34, total 8+13+13+6+8=48)
 *   internal/handler/user.go   : 30 covered / 50 total = 60%     (10+10+10=30, total 10+10+10+10+10=50)
 *   internal/handler/health.go : 11 covered / 11 total = 100%
 *   internal/model/user.go     : 21 covered / 21 total = 100%
 *   pkg/config/config.go       : 26 covered / 34 total = 76.47%  (10+6+10=26, total 10+6+10+8=34)
 */
const GO_HEAD_EXPECTED: Record<string, { covered: number; total: number; pct: number; }> = {
	"github.com/myorg/myapp/cmd/server/main.go": { covered: 13, total: 21, pct: 61.9 },
	"github.com/myorg/myapp/internal/auth/jwt.go": { covered: 29, total: 37, pct: 78.38 },
	"github.com/myorg/myapp/internal/auth/middleware.go": { covered: 23, total: 28, pct: 82.14 },
	"github.com/myorg/myapp/internal/db/postgres.go": { covered: 34, total: 48, pct: 70.83 },
	"github.com/myorg/myapp/internal/handler/user.go": { covered: 30, total: 50, pct: 60 },
	"github.com/myorg/myapp/internal/handler/health.go": { covered: 11, total: 11, pct: 100 },
	"github.com/myorg/myapp/internal/model/user.go": { covered: 21, total: 21, pct: 100 },
	"github.com/myorg/myapp/pkg/config/config.go": { covered: 26, total: 34, pct: 76.47 },
};

/**
 * go-base.out expected per-file:
 *   cmd/server/main.go         : 21/21 = 100%       (all 3 blocks covered)
 *   internal/auth/jwt.go       : 16/37 = 43.24%     (8+8=16)
 *   internal/auth/middleware.go : 15/28 = 53.57%     (7+8=15)
 *   internal/db/postgres.go    : 21/48 = 43.75%     (8+13=21)
 *   internal/handler/user.go   : 20/50 = 40%        (10+10=20)
 *   internal/handler/health.go : 11/11 = 100%
 *   internal/model/user.go     : 21/21 = 100%
 *   pkg/config/config.go       : 16/34 = 47.06%     (10+6=16)
 *   internal/deprecated/old.go : 10/15 = 66.67%
 */
const GO_BASE_EXPECTED: Record<string, { covered: number; total: number; pct: number; }> = {
	"github.com/myorg/myapp/cmd/server/main.go": { covered: 21, total: 21, pct: 100 },
	"github.com/myorg/myapp/internal/auth/jwt.go": { covered: 16, total: 37, pct: 43.24 },
	"github.com/myorg/myapp/internal/auth/middleware.go": { covered: 15, total: 28, pct: 53.57 },
	"github.com/myorg/myapp/internal/db/postgres.go": { covered: 21, total: 48, pct: 43.75 },
	"github.com/myorg/myapp/internal/handler/user.go": { covered: 20, total: 50, pct: 40 },
	"github.com/myorg/myapp/internal/handler/health.go": { covered: 11, total: 11, pct: 100 },
	"github.com/myorg/myapp/internal/model/user.go": { covered: 21, total: 21, pct: 100 },
	"github.com/myorg/myapp/pkg/config/config.go": { covered: 16, total: 34, pct: 47.06 },
	"github.com/myorg/myapp/internal/deprecated/old.go": { covered: 10, total: 15, pct: 66.67 },
};

describe("Go cover profile integration", () => {
	let headFiles: FileCoverage[];
	let baseFiles: FileCoverage[];

	beforeAll(() => {
		headFiles = parseGoCover(read("go-head.out"));
		baseFiles = parseGoCover(read("go-base.out"));
	});

	// ── Parsing ─────────────────────────────────────────────────────

	test("head: parses all 8 files", () => {
		expect(headFiles).toHaveLength(8);
	});

	test("head: every file matches expected covered/total/percent", () => {
		for (const f of headFiles) {
			const exp = GO_HEAD_EXPECTED[f.file];
			expect(exp).toBeDefined();
			expect(f.coveredLines).toBe(exp.covered);
			expect(f.totalLines).toBe(exp.total);
			expect(f.percent).toBe(exp.pct);
		}
	});

	test("base: parses all 9 files (includes deprecated/old.go)", () => {
		expect(baseFiles).toHaveLength(9);
	});

	test("base: every file matches expected covered/total/percent", () => {
		for (const f of baseFiles) {
			const exp = GO_BASE_EXPECTED[f.file];
			expect(exp).toBeDefined();
			expect(f.coveredLines).toBe(exp.covered);
			expect(f.totalLines).toBe(exp.total);
			expect(f.percent).toBe(exp.pct);
		}
	});

	test("head: files are sorted alphabetically", () => {
		const paths = headFiles.map((f) => f.file);
		const sorted = [...paths].sort();
		expect(paths).toEqual(sorted);
	});

	// ── Diffing ─────────────────────────────────────────────────────

	test("diff: detects deleted file (deprecated/old.go)", () => {
		const diffs = computeFileDiffs(headFiles, baseFiles);
		const deleted = diffs.find((d) =>
			d.file === "github.com/myorg/myapp/internal/deprecated/old.go"
		);
		expect(deleted).toBeDefined();
		expect(deleted!.percent).toBe(0);
		expect(deleted!.basePercent).toBe(66.67);
		expect(deleted!.delta).toBe(-66.67);
	});

	test("diff: main.go coverage decreased (100% → 61.90%)", () => {
		const diffs = computeFileDiffs(headFiles, baseFiles);
		const main = diffs.find((d) => d.file === "github.com/myorg/myapp/cmd/server/main.go");
		expect(main).toBeDefined();
		expect(main!.delta).toBeCloseTo(-38.10, 1);
	});

	test("diff: jwt.go coverage increased (43.24% → 78.38%)", () => {
		const diffs = computeFileDiffs(headFiles, baseFiles);
		const jwt = diffs.find((d) => d.file === "github.com/myorg/myapp/internal/auth/jwt.go");
		expect(jwt).toBeDefined();
		expect(jwt!.delta).toBeGreaterThan(0);
		expect(jwt!.delta).toBeCloseTo(35.14, 1);
	});

	test("diff: middleware.go coverage increased (53.57% → 82.14%)", () => {
		const diffs = computeFileDiffs(headFiles, baseFiles);
		const mw = diffs.find((d) =>
			d.file === "github.com/myorg/myapp/internal/auth/middleware.go"
		);
		expect(mw).toBeDefined();
		expect(mw!.delta).toBeCloseTo(28.57, 1);
	});

	test("diff: health.go and model/user.go unchanged at 100%", () => {
		const diffs = computeFileDiffs(headFiles, baseFiles);
		for (
			const path of [
				"github.com/myorg/myapp/internal/handler/health.go",
				"github.com/myorg/myapp/internal/model/user.go",
			]
		) {
			const d = diffs.find((x) => x.file === path);
			expect(d).toBeDefined();
			expect(d!.delta).toBe(0);
		}
	});

	// ── Report building ─────────────────────────────────────────────

	test("buildToolReport: summary aggregates correctly", () => {
		const baseArtifact: CoverageArtifact = {
			tool: "go",
			files: baseFiles,
			commitSha: "gobase456",
			branch: "main",
			timestamp: "2026-01-01T00:00:00Z",
		};
		const report = buildToolReport("go", headFiles, baseArtifact, []);

		// Head totals: 13+29+23+34+30+11+21+26 = 187 covered, 21+37+28+48+50+11+21+34 = 250 total
		expect(report.summary.coveredLines).toBe(187);
		expect(report.summary.totalLines).toBe(250);
		expect(report.summary.percent).toBe(74.8);

		// Base totals: 21+16+15+21+20+11+21+16+10 = 151 covered, 21+37+28+48+50+11+21+34+15 = 265 total
		expect(report.summary.baseCoveredLines).toBe(151);
		expect(report.summary.baseTotalLines).toBe(265);
		expect(report.summary.basePercent).toBeCloseTo(56.98, 1);

		// Coverage improved overall
		expect(report.summary.delta).toBeGreaterThan(0);
	});
});

// ═════════════════════════════════════════════════════════════════════
// §3  Multi-tool full pipeline (Bun + Go combined)
// ═════════════════════════════════════════════════════════════════════

describe("Multi-tool full pipeline", () => {
	let bunHead: FileCoverage[];
	let bunBase: FileCoverage[];
	let goHead: FileCoverage[];
	let goBase: FileCoverage[];

	beforeAll(() => {
		bunHead = parseLcov(read("bun-head.lcov"));
		bunBase = parseLcov(read("bun-base.lcov"));
		goHead = parseGoCover(read("go-head.out"));
		goBase = parseGoCover(read("go-base.out"));
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

		// Overall: bun 192/230 + go 187/250 = 379/480
		expect(full.overall.coveredLines).toBe(192 + 187);
		expect(full.overall.totalLines).toBe(230 + 250);
		expect(full.overall.percent).toBeCloseTo(78.96, 0);

		// Base overall: bun 175/192 + go 151/265 = 326/457
		expect(full.overall.basePercent).toBeCloseTo(71.33, 0);

		// Coverage improved overall (78.96 - 71.33 ≈ +7.63)
		expect(full.overall.delta).toBeGreaterThan(0);
		expect(full.overall.delta).toBeCloseTo(7.63, 0);
	});

	test("renderReport: produces valid markdown with both tool tables", () => {
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

		// Specific file rows
		expect(md).toContain("src/components/Button.tsx");
		expect(md).toContain("src/api/client.ts");
		expect(md).toContain("github.com/myorg/myapp/internal/auth/jwt.go");
		expect(md).toContain("github.com/myorg/myapp/cmd/server/main.go");

		// Delta markers present
		expect(md).toContain("[+]"); // positive deltas (jwt.go improved)
		expect(md).toContain("[-]"); // negative deltas (Button.tsx decreased)

		// Deleted files show up
		expect(md).toContain("src/legacy/deprecated.ts");
		expect(md).toContain("github.com/myorg/myapp/internal/deprecated/old.go");
	});

	test("renderReport: colorize=off suppresses delta markers", () => {
		const bunReport = buildToolReport("bun", bunHead, null, []);
		const goReport = buildToolReport("go", goHead, null, []);
		const full = buildFullReport([bunReport, goReport]);
		const md = renderReport(full, "<!-- no-color -->", false);

		expect(md).not.toContain("[+]");
		expect(md).not.toContain("[-]");
		// No base → no deltas shown at all
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

// ═════════════════════════════════════════════════════════════════════
// §4  Edge cases — malformed / partial tool outputs
// ═════════════════════════════════════════════════════════════════════

describe("Edge cases with real-ish tool output", () => {
	test("LCOV: file with only branch data (no DA lines) uses LH/LF fallback", () => {
		// Some coverage tools emit BRDA lines but no DA lines
		const input = `TN:
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
		// This can happen with merge of multiple test runs
		const input = `TN:
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
		// Parser treats each record independently — 2 entries
		expect(result).toHaveLength(2);
		// First record: 2/3, second: 3/3
		expect(result[0].coveredLines).toBe(2);
		expect(result[1].coveredLines).toBe(3);
	});

	test("Go: mode: atomic with large counts", () => {
		const input = `mode: atomic
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
		const input = `mode: set
  github.com/myorg/app/spaced.go:1.1,5.2 3 1  
github.com/myorg/app/spaced.go:7.1,10.2 2 0
`;
		const result = parseGoCover(input);
		expect(result).toHaveLength(1);
		expect(result[0].coveredLines).toBe(3);
		expect(result[0].totalLines).toBe(5);
	});

	test("Go: completely uncovered file produces 0%", () => {
		const input = `mode: set
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
		// Overall should be 100% (0/0 → convention)
		expect(full.overall.percent).toBe(100);
		expect(md).toContain("100.00%");
	});

	test("LCOV: real-world bun output round-trips through full pipeline", () => {
		// Parse → build report → render → verify no crash and valid structure
		const files = parseLcov(read("bun-head.lcov"));
		const report = buildToolReport("bun", files, null, []);
		const full = buildFullReport([report]);
		const md = renderReport(full, "<!-- rt -->", true);

		// All 5 files present in markdown
		for (const f of files) {
			expect(md).toContain(f.file);
		}
		// Summary line exists
		expect(md).toContain("Bun Coverage:");
	});

	test("Go: real-world output round-trips through full pipeline", () => {
		const files = parseGoCover(read("go-head.out"));
		const report = buildToolReport("go", files, null, []);
		const full = buildFullReport([report]);
		const md = renderReport(full, "<!-- rt-go -->", true);

		for (const f of files) {
			expect(md).toContain(f.file);
		}
		expect(md).toContain("Go Coverage:");
	});
});

// ═════════════════════════════════════════════════════════════════════
// §5  Numeric precision & percentage calculations
// ═════════════════════════════════════════════════════════════════════

describe("Numeric precision", () => {
	test("LCOV percentages are rounded to 2 decimal places", () => {
		// 7/11 = 63.636363...% should round to 63.64%
		const input = `SF:precision.ts
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
		// 7/11 statements = 63.636363...% → 63.64%
		const input = `mode: set
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
