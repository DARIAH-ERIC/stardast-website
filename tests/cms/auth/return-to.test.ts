import { expect, test } from "bun:test";

import { getSafeReturnTo } from "#/src/lib/cms/auth/return-to.ts";

test("allows local paths", () => {
	expect(getSafeReturnTo("/admin/collections/news?x=1#y")).toBe("/admin/collections/news?x=1#y");
	expect(getSafeReturnTo("/news/a?preview")).toBe("/news/a?preview");
});

test("rejects anything which could lead to another host", () => {
	for (const value of [
		"//example.org",
		"/\\example.org",
		"/\t/example.org",
		"/\n/example.org",
		"https://example.org",
		"example.org",
		"",
		null,
		undefined,
	]) {
		expect(getSafeReturnTo(value)).toBe("/admin");
	}
});
