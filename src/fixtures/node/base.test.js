import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
	add,
	divide,
} from "./calc.js";
import {
	padLeft,
	reverse,
} from "./strutil.js";

// Base tests: covers add, divide, reverse, padLeft
// Does NOT cover: subtract, multiply, modulo, capitalize, truncate

test("add", () => {
	assert.equal(add(10, 20), 30);
});

test("divide", () => {
	assert.equal(divide(10, 2), 5);
	assert.throws(() => divide(5, 0), /division by zero/);
});

test("reverse", () => {
	assert.equal(reverse("xyz"), "zyx");
});

test("padLeft", () => {
	assert.equal(padLeft("42", 5, "0"), "00042");
	assert.equal(padLeft("test", 2), "test");
});
