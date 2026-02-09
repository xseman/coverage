import {
	describe,
	expect,
	test,
} from "bun:test";

import { parseLcov } from "./lcov";

const SAMPLE_LCOV = `TN:
SF:src/index.ts
FN:1,main
FNDA:1,main
FNF:1
FNH:1
DA:1,1
DA:2,1
DA:3,0
DA:4,1
DA:5,0
DA:6,0
LH:3
LF:6
end_of_record
TN:
SF:src/utils.ts
DA:1,1
DA:2,1
DA:3,1
DA:4,1
LH:4
LF:4
end_of_record
`;

describe("parseLcov", () => {
	test("parses multi-file LCOV content", () => {
		const result = parseLcov(SAMPLE_LCOV);
		expect(result).toHaveLength(2);

		const idx = result.find((f) => f.file === "src/index.ts");
		expect(idx).toBeDefined();
		expect(idx!.coveredLines).toBe(3);
		expect(idx!.totalLines).toBe(6);
		expect(idx!.percent).toBe(50);

		const utils = result.find((f) => f.file === "src/utils.ts");
		expect(utils).toBeDefined();
		expect(utils!.coveredLines).toBe(4);
		expect(utils!.totalLines).toBe(4);
		expect(utils!.percent).toBe(100);
	});

	test("handles empty input", () => {
		expect(parseLcov("")).toEqual([]);
	});

	test("handles single file with no DA lines but LH/LF", () => {
		const input = `SF:lib/foo.ts
LH:5
LF:10
end_of_record
`;
		const result = parseLcov(input);
		expect(result).toHaveLength(1);
		expect(result[0].file).toBe("lib/foo.ts");
		expect(result[0].coveredLines).toBe(5);
		expect(result[0].totalLines).toBe(10);
		expect(result[0].percent).toBe(50);
	});

	test("handles records with zero total lines", () => {
		const input = `SF:empty.ts
end_of_record
`;
		const result = parseLcov(input);
		expect(result).toHaveLength(1);
		expect(result[0].percent).toBe(100); // No coverable lines → 100%
	});

	test("handles DA lines with no checksum", () => {
		const input = `SF:simple.ts
DA:1,5
DA:2,0
end_of_record
`;
		const result = parseLcov(input);
		expect(result[0].coveredLines).toBe(1);
		expect(result[0].totalLines).toBe(2);
	});

	test("handles whitespace and trailing newlines", () => {
		const input = `
  SF:padded.ts
  DA:1,1
  DA:2,1
  DA:3,0
  end_of_record

`;
		const result = parseLcov(input);
		expect(result).toHaveLength(1);
		expect(result[0].file).toBe("padded.ts");
		expect(result[0].coveredLines).toBe(2);
		expect(result[0].totalLines).toBe(3);
	});
});
