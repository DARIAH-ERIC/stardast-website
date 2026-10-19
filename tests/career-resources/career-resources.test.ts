import { expect, test } from "bun:test";

import { hasKeyword, toResource } from "#/src/lib/career-resources.ts";

test("matches keywords ignoring case and surrounding whitespace", () => {
	expect(hasKeyword({ keywords: ["data stewardship", " cv EXAMPLE "] }, "CV example")).toBe(true);
	expect(hasKeyword({ keywords: ["CV examples"] }, "CV example")).toBe(false);
	expect(hasKeyword({ keywords: [] }, "CV example")).toBe(false);
});

test("links a resource to its record on zenodo, with a plain text summary", () => {
	const resource = toResource({
		id: "1",
		title: "Example CV",
		publicationDate: "2026-10-01",
		description: "<p>A CV.</p>",
		keywords: ["CV example"],
		url: "https://zenodo.org/records/1",
	});

	expect(resource).toEqual({
		id: "1",
		title: "Example CV",
		summary: "A CV.",
		publicationDate: "2026-10-01",
		href: "https://zenodo.org/records/1",
	});
	expect(toResource({ ...resource, keywords: [], url: resource.href, description: "<p></p>" }).summary).toBeUndefined();
});
