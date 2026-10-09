import { expect, test } from "bun:test";

import { paginate, parsePageParam } from "#/src/lib/pagination.ts";

test("parses the page parameter, with one url per page", () => {
	expect(parsePageParam(null)).toBe(1);
	expect(parsePageParam("1")).toBe(1);
	expect(parsePageParam("12")).toBe(12);

	for (const value of ["", "0", "01", "-1", "1.5", "2a", " 2", "1e3", "9999999"]) {
		expect(parsePageParam(value), JSON.stringify(value)).toBeUndefined();
	}
});

test("paginates, and rejects pages past the last one", () => {
	const items = Array.from({ length: 20 }, (_, index) => index);

	expect(paginate(items, 1, 9)).toEqual({ items: [0, 1, 2, 3, 4, 5, 6, 7, 8], page: 1, pageCount: 3 });
	expect(paginate(items, 3, 9)).toEqual({ items: [18, 19], page: 3, pageCount: 3 });
	expect(paginate(items, 4, 9)).toBeUndefined();
	expect(paginate(items, 0, 9)).toBeUndefined();
});

test("an empty list has one empty page", () => {
	expect(paginate([], 1, 9)).toEqual({ items: [], page: 1, pageCount: 1 });
	expect(paginate([], 2, 9)).toBeUndefined();
});
