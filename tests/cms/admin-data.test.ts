import { expect, test } from "bun:test";

import { getNestedIssues, groupIssues, moveItem, setIn } from "#/src/components/admin/data.ts";
import { slugify } from "#/src/lib/cms/slug.ts";

test("slugify", () => {
	expect(slugify("  Jürgen's Call for Contributions — 2026!  ")).toBe("jurgen-s-call-for-contributions-2026");
	expect(slugify("---")).toBe("");
});

test("setIn updates immutably, and omits undefined values", () => {
	const data = { title: "A", authors: ["a", "b"], meta: { subtitle: "S" } };

	expect(setIn(data, ["authors", 1], "c")).toEqual({ title: "A", authors: ["a", "c"], meta: { subtitle: "S" } });
	expect(setIn(data, ["meta", "subtitle"], undefined)).toEqual({ title: "A", authors: ["a", "b"], meta: {} });
	expect(setIn({}, ["meta", "subtitle"], "S")).toEqual({ meta: { subtitle: "S" } });
	expect(data).toEqual({ title: "A", authors: ["a", "b"], meta: { subtitle: "S" } });
});

test("nested issues include descendants, but not siblings with a common prefix", () => {
	const issues = groupIssues([
		{ path: "content.content.0", message: "a" },
		{ path: "content", message: "b" },
		{ path: "contentType", message: "c" },
	]);

	expect(getNestedIssues(issues, "content")).toEqual(["a", "b"]);
});

test("moveItem moves to an insertion point, i.e. before the item at that index", () => {
	const items = ["a", "b", "c", "d"];

	expect(moveItem(items, 0, 2)).toEqual(["b", "a", "c", "d"]);
	expect(moveItem(items, 0, 4)).toEqual(["b", "c", "d", "a"]);
	expect(moveItem(items, 3, 0)).toEqual(["d", "a", "b", "c"]);
	expect(moveItem(items, 2, 1)).toEqual(["a", "c", "b", "d"]);
	expect(moveItem(items, 1, 1)).toEqual(items);
	expect(moveItem(items, 1, 2)).toEqual(items);
	expect(items).toEqual(["a", "b", "c", "d"]);
});
