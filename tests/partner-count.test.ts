import { expect, test } from "bun:test";

import { fillPartnerCount } from "#/src/lib/partner-count.ts";

test("the partner count placeholder is replaced with the number of partners", () => {
	expect(fillPartnerCount("{partners} partners from science", 19)).toBe("19 partners from science");
	expect(fillPartnerCount("{partners} partners, of which {partners} are listed", 2)).toBe(
		"2 partners, of which 2 are listed",
	);
	expect(fillPartnerCount("Consortium", 19)).toBe("Consortium");
});
