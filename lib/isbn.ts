/**
 * Convert ISBN-10 to ISBN-13 by prepending "978" and recalculating the check digit.
 */
export function isbn10to13(isbn10: string): string {
	const base = `978${isbn10.slice(0, 9)}`;
	let sum = 0;
	for (let i = 0; i < 12; i++) {
		sum += Number.parseInt(base[i], 10) * (i % 2 === 0 ? 1 : 3);
	}
	const check = (10 - (sum % 10)) % 10;
	return `${base}${check}`;
}

/**
 * Validate an ISBN-13 string: 13 digits with valid check digit.
 */
export function isValidIsbn13(isbn: string): boolean {
	if (!/^\d{13}$/.test(isbn)) return false;
	let sum = 0;
	for (let i = 0; i < 12; i++) {
		sum += Number.parseInt(isbn[i], 10) * (i % 2 === 0 ? 1 : 3);
	}
	const check = (10 - (sum % 10)) % 10;
	return check === Number.parseInt(isbn[12], 10);
}

/**
 * Normalize a scanned barcode value to ISBN-13.
 * Handles ISBN-10 (10 digits) and ISBN-13 (13 digits).
 * Returns null if the value is not a valid ISBN.
 */
export function normalizeIsbn(raw: string): string | null {
	const digits = raw.replace(/[^0-9X]/gi, '');

	if (digits.length === 13) {
		return isValidIsbn13(digits) ? digits : null;
	}

	if (digits.length === 10) {
		const isbn13 = isbn10to13(digits);
		return isValidIsbn13(isbn13) ? isbn13 : null;
	}

	return null;
}
