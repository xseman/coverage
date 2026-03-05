import {
	expect,
	test,
} from "bun:test";

import {
	add,
	divide,
} from "./calc";
import {
	padLeft,
	reverse,
} from "./strutil";

// Base tests: covers add, divide, reverse, padLeft
// Does NOT cover: subtract, multiply, modulo, capitalize, truncate

test("add", () => {
	expect(add(1, 2)).toBe(3);
});

test("divide", () => {
	expect(divide(10, 2)).toBe(5);
	expect(() => divide(1, 0)).toThrow("division by zero");
});

test("reverse", () => {
	expect(reverse("abc")).toBe("cba");
});

test("padLeft", () => {
	expect(padLeft("hi", 5, "0")).toBe("000hi");
	expect(padLeft("hello", 3, "0")).toBe("hello");
});
