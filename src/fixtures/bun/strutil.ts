export function reverse(s: string): string {
	return s.split("").reverse().join("");
}

export function capitalize(s: string): string {
	if (s.length === 0) {
		return s;
	}
	return s[0].toUpperCase() + s.slice(1);
}

export function truncate(s: string, maxLen: number): string {
	if (s.length <= maxLen) {
		return s;
	}
	return s.slice(0, maxLen) + "...";
}

export function padLeft(s: string, len: number, ch: string): string {
	if (s.length >= len) {
		return s;
	}
	return ch.repeat(len - s.length) + s;
}
