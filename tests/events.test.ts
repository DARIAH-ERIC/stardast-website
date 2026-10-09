import { expect, test } from "bun:test";

import { getSecondsUntilTomorrow, getToday, isUpcoming } from "#/src/lib/events.ts";

test("events are upcoming until the end of their last day, in utc", () => {
	const today = getToday(new Date("2027-03-05T23:59:59Z"));

	expect(today).toBe("2027-03-05");
	expect(isUpcoming({ startDate: "2027-03-05" }, today)).toBe(true);
	expect(isUpcoming({ startDate: "2027-03-03", endDate: "2027-03-05" }, today)).toBe(true);
	expect(isUpcoming({ startDate: "2027-03-03", endDate: "2027-03-04" }, today)).toBe(false);
	expect(isUpcoming({ startDate: "2027-03-04" }, today)).toBe(false);
});

test("pages listing upcoming events expire at the next midnight utc", () => {
	expect(getSecondsUntilTomorrow(new Date("2027-03-05T23:00:00Z"))).toBe(3600);
	expect(getSecondsUntilTomorrow(new Date("2027-03-05T00:00:00Z"))).toBe(86_400);
	expect(getSecondsUntilTomorrow(new Date("2027-03-05T23:59:59.900Z"))).toBe(1);
});
