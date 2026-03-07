const PERCENT_SCALE = 10000;
const PERCENT_DIVISOR = 100;

export function calculatePercent(covered: number, total: number): number {
	if (total <= 0) return 100;
	return Math.round((covered / total) * PERCENT_SCALE) / PERCENT_DIVISOR;
}

export function formatPercentValue(percent: number): string {
	return percent.toFixed(2);
}

export function formatPercent(percent: number): string {
	return `${formatPercentValue(percent)}%`;
}

export function roundDelta(a: number, b: number): number {
	return Math.round((a - b) * 100) / 100;
}
