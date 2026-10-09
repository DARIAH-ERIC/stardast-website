/**
 * Event dates are calendar days without time zone, which are compared with the current day in utc - so an event turns
 * from upcoming to past at midnight utc after its last day.
 */

export interface EventDates {
	startDate: string;
	endDate?: string;
}

/** The current day as an iso date, i.e. `yyyy-mm-dd`, which compares lexicographically with event dates. */
export function getToday(now: Date = new Date()): string {
	return now.toISOString().slice(0, 10);
}

export function isUpcoming(event: EventDates, today: string): boolean {
	return (event.endDate ?? event.startDate) >= today;
}

/** Until the next midnight utc, when upcoming events may become past events. At least one second. */
export function getSecondsUntilTomorrow(now: Date = new Date()): number {
	const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);

	return Math.max(1, Math.ceil((tomorrow - now.getTime()) / 1000));
}
