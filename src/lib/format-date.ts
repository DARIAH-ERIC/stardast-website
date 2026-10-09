const formatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });

/** Formats an iso date, i.e. `yyyy-mm-dd`, which is parsed as midnight utc - hence the utc time zone. */
export function formatDate(isoDate: string): string {
	return formatter.format(new Date(isoDate));
}

/** Formats the dates of an event, e.g. `3 March 2027`, or `3 – 5 March 2027` - with utc, like `formatDate()`. */
export function formatDateRange(startDate: string, endDate?: string): string {
	if (endDate == null || endDate === startDate) {
		return formatDate(startDate);
	}

	return formatter.formatRange(new Date(startDate), new Date(endDate));
}
