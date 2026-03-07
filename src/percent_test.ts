import {
	describe,
	expect,
	test,
} from "bun:test";

import {
	calculatePercent,
	formatPercent,
	formatPercentValue,
	roundDelta,
} from "./percent";

describe("calculatePercent", () => {
	test("rounds coverage to two decimal places", () => {
		expect(calculatePercent(13, 16)).toBe(81.25);
		expect(calculatePercent(1, 3)).toBe(33.33);
	});

	test("treats empty totals as fully covered", () => {
		expect(calculatePercent(0, 0)).toBe(100);
		expect(calculatePercent(5, 0)).toBe(100);
	});
});

describe("formatPercent helpers", () => {
	test("formats raw percent values without a suffix", () => {
		expect(formatPercentValue(80)).toBe("80.00");
		expect(formatPercentValue(33.333)).toBe("33.33");
	});

	test("formats percent values with a suffix", () => {
		expect(formatPercent(80)).toBe("80.00%");
		expect(formatPercent(-10)).toBe("-10.00%");
	});
});

describe("roundDelta", () => {
	test("rounds the signed difference to two decimal places", () => {
		expect(roundDelta(90, 70)).toBe(20);
		expect(roundDelta(70, 90)).toBe(-20);
		expect(roundDelta(83.333, 80)).toBe(3.33);
	});

	test("returns zero for equal values", () => {
		expect(roundDelta(75, 75)).toBe(0);
	});
});
