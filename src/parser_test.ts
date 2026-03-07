import {
	describe,
	expect,
	test,
} from "bun:test";

import { parseGoCover } from "./go";
import { parseLcov } from "./lcov";
import {
	getCoverageParser,
	getSupportedCoverageTools,
} from "./parser";

describe("getCoverageParser", () => {
	test("returns the LCOV parser for LCOV aliases", () => {
		expect(getCoverageParser("lcov")).toBe(parseLcov);
		expect(getCoverageParser("bun")).toBe(parseLcov);
		expect(getCoverageParser("node")).toBe(parseLcov);
	});

	test("returns the Go parser for Go aliases", () => {
		expect(getCoverageParser("go")).toBe(parseGoCover);
		expect(getCoverageParser("gocover")).toBe(parseGoCover);
	});

	test("returns undefined for unsupported tools", () => {
		expect(getCoverageParser("python")).toBeUndefined();
	});
});

describe("getSupportedCoverageTools", () => {
	test("returns the registered tools in warning order", () => {
		expect(getSupportedCoverageTools()).toEqual(["lcov", "bun", "node", "go", "gocover"]);
	});
});
