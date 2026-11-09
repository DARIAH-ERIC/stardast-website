import { expect, test } from "bun:test";

import { formatPartialDate } from "#/src/lib/format-date.ts";

test("formats a year, month or day", () => {
	expect(formatPartialDate("2026")).toBe("2026");
	expect(formatPartialDate("2026-10")).toBe("October 2026");
	expect(formatPartialDate("2026-10-01")).toBe("1 October 2026");
});
