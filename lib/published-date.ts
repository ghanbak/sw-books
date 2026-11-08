/**
 * Format a `date_published` value (`YYYY-MM-DD`) as "January 5, 2021".
 *
 * A date-only ISO string parses as UTC midnight, so it must also be formatted in UTC.
 * In the device zone, UTC-negative devices would show the previous day.
 */
export function formatPublishedDate(date: string | null): string | null {
	if (!date) return null;
	return new Date(date).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC',
	});
}
