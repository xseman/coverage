export function add(a: number, b: number): number {
	return a + b;
}

export function subtract(a: number, b: number): number {
	return a - b;
}

export function multiply(a: number, b: number): number {
	if (a === 0 || b === 0) {
		return 0;
	}
	return a * b;
}

export function divide(a: number, b: number): number {
	if (b === 0) {
		throw new Error("division by zero");
	}
	return a / b;
}

export function modulo(a: number, b: number): number {
	if (b === 0) {
		throw new Error("modulo by zero");
	}
	return a % b;
}
