export function add(a, b) {
	return a + b;
}

export function subtract(a, b) {
	return a - b;
}

export function multiply(a, b) {
	if (a === 0 || b === 0) {
		return 0;
	}
	return a * b;
}

export function divide(a, b) {
	if (b === 0) {
		throw new Error("division by zero");
	}
	return a / b;
}

export function modulo(a, b) {
	if (b === 0) {
		throw new Error("modulo by zero");
	}
	return a % b;
}
