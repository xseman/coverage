/**
 * On-the-fly fixture generation — spawns real `bun test`, `node --test`, and
 * `go test` to produce authentic coverage artifacts for integration tests.
 *
 * Each generator returns the raw string content (LCOV or Go cover profile)
 * identical to what the action would read from disk.
 */

import { $ } from "bun";
import {
	mkdtempSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIXTURES = import.meta.dir;

/** Run a callback with a temporary directory, cleaned up afterward. */
async function withTmpDir<T>(
	prefix: string,
	fn: (dir: string) => Promise<T>,
): Promise<T> {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	try {
		return await fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** Tool-specific coverage generators. Each takes a test-file or pattern arg. */
const generators = {
	bun: (testFile: string) =>
		withTmpDir("bun-cov-", async (tmp) => {
			await $`bun test ${testFile} --coverage --coverage-reporter=lcov --coverage-dir=${tmp}`
				.cwd(join(FIXTURES, "bun"))
				.quiet();
			return readFileSync(join(tmp, "lcov.info"), "utf-8");
		}),

	node: (testFile: string) =>
		$`node --test --experimental-test-coverage --test-reporter=lcov --test-coverage-exclude='**/*.test.js' ${testFile}`
			.cwd(join(FIXTURES, "node"))
			.text(),

	go: (testPattern: string) =>
		withTmpDir("go-cov-", async (tmp) => {
			const out = join(tmp, "coverage.out");
			await $`go test -run ${testPattern} -coverprofile=${out} ./...`
				.cwd(join(FIXTURES, "goproject"))
				.quiet();
			return readFileSync(out, "utf-8");
		}),
} as const;

/** Head and base arguments for each tool. */
const variants = {
	bun: { head: "head.test.ts", base: "base.test.ts" },
	node: { head: "head.test.js", base: "base.test.js" },
	go: {
		head: "^Test(Add|Subtract|Multiply|Reverse|Capitalize|Truncate)$",
		base: "^Test(AddBase|DivideBase|ReverseBase|PadLeftBase)$",
	},
} as const;

export type ToolName = keyof typeof generators;
export type GeneratedFixtures = Record<ToolName, { head: string; base: string; }>;

/**
 * Generate all fixture coverage data by running real tools.
 * Tools run in parallel; head and base variants run in parallel per tool.
 * Call once in `beforeAll` — results are deterministic per test run.
 */
export async function generateFixtures(): Promise<GeneratedFixtures> {
	const entries = await Promise.all(
		(Object.keys(generators) as ToolName[]).map(async (tool) => {
			const gen = generators[tool];
			const v = variants[tool];
			const [head, base] = await Promise.all([gen(v.head), gen(v.base)]);
			return [tool, { head, base }] as const;
		}),
	);

	return Object.fromEntries(entries) as GeneratedFixtures;
}
