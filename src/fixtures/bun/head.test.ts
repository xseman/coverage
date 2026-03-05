import {
	expect,
	test,
} from "bun:test";

import {
	add,
	multiply,
	subtract,
} from "./calc";
import {
	capitalize,
	reverse,
	truncate,
} from "./strutil";

// Head tests: covers add, subtract, multiply, reverse, capitalize, truncate
// Does NOT cover: divide, modulo, padLeft

test("add", () => {
	expect(add(1, 2)).toBe(3);
	expect(add(-1, 1)).toBe(0);
});

test("subtract", () => {
	expect(subtract(5, 3)).toBe(2);
});

test("multiply", () => {
	expect(multiply(3, 4)).toBe(12);
	expect(multiply(0, 5)).toBe(0);
});

test("reverse", () => {
	expect(reverse("abc")).toBe("cba");
});

test("capitalize", () => {
	expect(capitalize("hello")).toBe("Hello");
	expect(capitalize("")).toBe("");
});

test("truncate", () => {
	expect(truncate("hello world", 5)).toBe("hello...");
	expect(truncate("hi", 10)).toBe("hi");
});
