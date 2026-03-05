export function reverse(str) {
	return str.split("").reverse().join("");
}

export function capitalize(str) {
	if (str.length === 0) {
		return str;
	}
	return str.charAt(0).toUpperCase() + str.slice(1);
}

export function truncate(str, maxLen) {
	if (str.length <= maxLen) {
		return str;
	}
	return str.substring(0, maxLen) + "...";
}

export function padLeft(str, totalLen, padChar = " ") {
	if (str.length >= totalLen) {
		return str;
	}
	const padLen = totalLen - str.length;
	return padChar.repeat(padLen) + str;
}
