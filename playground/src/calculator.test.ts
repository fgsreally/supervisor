import { sumNumbers } from "./calculator.js";

function assertEqual(actual: number, expected: number, message: string): void {
	if (actual !== expected) {
		throw new Error(`${message}: expected ${expected}, got ${actual}`);
	}
}

assertEqual(sumNumbers([1, 2, 3]), 6, "sums finite numbers");
assertEqual(sumNumbers([1, Number.NaN, 2, Infinity, -Infinity]), 3, "ignores non-finite numbers");
assertEqual(sumNumbers([]), 0, "empty array returns zero");
assertEqual(sumNumbers([Number.NaN, Infinity]), 0, "no finite numbers returns zero");
