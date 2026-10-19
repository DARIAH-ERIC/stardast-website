const formatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });

/** Formats an iso date, i.e. `yyyy-mm-dd`, which is parsed as midnight utc - hence the utc time zone. */
export function formatDate(isoDate: string): string {
	return formatter.format(new Date(isoDate));
}

const yearFormatter = new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "UTC" });
const monthFormatter = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", timeZone: "UTC" });

/**
 * Formats a year, month or day, i.e. `yyyy`, `yyyy-mm` or `yyyy-mm-dd`, e.g. `2026`, `October 2026` or `1 October
 * 2026`.
 */
export function formatPartialDate(date: string): string {
	const precision = date.split("-").length;

	return (precision === 1 ? yearFormatter : precision === 2 ? monthFormatter : formatter).format(new Date(date));
}

/** Formats the dates of an event, e.g. `3 March 2027`, or `3 – 5 March 2027` - with utc, like `formatDate()`. */
export function formatDateRange(startDate: string, endDate?: string): string {
	if (endDate == null || endDate === startDate) {
		return formatDate(startDate);
	}

	return formatter.formatRange(new Date(startDate), new Date(endDate));
}
