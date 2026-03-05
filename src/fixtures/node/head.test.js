import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
	add,
	multiply,
	subtract,
} from "./calc.js";
import {
	capitalize,
	reverse,
	truncate,
} from "./strutil.js";

// Head tests: covers add, subtract, multiply, reverse, capitalize, truncate
// Does NOT cover: divide, modulo, padLeft

test("add", () => {
	assert.equal(add(1, 2), 3);
	assert.equal(add(-1, 1), 0);
});

test("subtract", () => {
	assert.equal(subtract(5, 3), 2);
});

test("multiply", () => {
	assert.equal(multiply(3, 4), 12);
	assert.equal(multiply(0, 5), 0);
});

test("reverse", () => {
	assert.equal(reverse("abc"), "cba");
});

test("capitalize", () => {
	assert.equal(capitalize("hello"), "Hello");
	assert.equal(capitalize(""), "");
});

test("truncate", () => {
	assert.equal(truncate("hello world", 5), "hello...");
	assert.equal(truncate("hi", 10), "hi");
});
