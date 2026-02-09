import {
	describe,
	expect,
	test,
} from "bun:test";

import { parseGoCover } from "./go";

const SAMPLE_GO_COVER = `mode: set
mydomain.com/myprogram.go:10.13,12.2 1 1
mydomain.com/greetings/greetings.go:3.23,5.2 1 1
mydomain.com/greetings/greetings.go:7.20,10.2 3 0
mydomain.com/pkg/handler.go:15.30,20.2 5 1
mydomain.com/pkg/handler.go:22.25,30.2 8 1
mydomain.com/pkg/handler.go:32.10,35.2 3 0
`;

describe("parseGoCover", () => {
	test("parses multi-file Go cover profile", () => {
		const result = parseGoCover(SAMPLE_GO_COVER);
		expect(result.length).toBe(3);

		const greeting = result.find((f) => f.file === "mydomain.com/greetings/greetings.go");
		expect(greeting).toBeDefined();
		// statements: 1 (covered) + 3 (not covered) = 4 total, 1 covered
		expect(greeting!.coveredLines).toBe(1);
		expect(greeting!.totalLines).toBe(4);
		expect(greeting!.percent).toBe(25);

		const main = result.find((f) => f.file === "mydomain.com/myprogram.go");
		expect(main).toBeDefined();
		expect(main!.coveredLines).toBe(1);
		expect(main!.totalLines).toBe(1);
		expect(main!.percent).toBe(100);

		const handler = result.find((f) => f.file === "mydomain.com/pkg/handler.go");
		expect(handler).toBeDefined();
		// 5 + 8 + 3 = 16 total, 5 + 8 = 13 covered
		expect(handler!.coveredLines).toBe(13);
		expect(handler!.totalLines).toBe(16);
		expect(handler!.percent).toBe(81.25);
	});

	test("handles empty input", () => {
		expect(parseGoCover("")).toEqual([]);
	});

	test("handles mode-only input", () => {
		expect(parseGoCover("mode: set\n")).toEqual([]);
	});

	test("handles mode: count with counts > 1", () => {
		const input = `mode: count
pkg/a.go:1.1,5.2 3 42
pkg/a.go:6.1,10.2 2 0
`;
		const result = parseGoCover(input);
		expect(result).toHaveLength(1);
		expect(result[0].coveredLines).toBe(3);
		expect(result[0].totalLines).toBe(5);
	});

	test("results sorted by file path", () => {
		const input = `mode: set
z/z.go:1.1,2.2 1 1
a/a.go:1.1,2.2 1 1
m/m.go:1.1,2.2 1 1
`;
		const result = parseGoCover(input);
		expect(result.map((r) => r.file)).toEqual(["a/a.go", "m/m.go", "z/z.go"]);
	});
});
