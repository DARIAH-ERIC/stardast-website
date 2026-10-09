import { expect, test } from "bun:test";

import { block, fields, optional } from "#/src/lib/cms/schema/index.ts";
import { collectReferences } from "#/src/lib/cms/schema/references.ts";

const person = block({
	label: "Person",
	fields: { person: fields.reference({ label: "Person", collection: "people" }) },
});

const schema = {
	author: optional(fields.reference({ label: "Author", collection: "people" })),
	contributors: fields.array(fields.reference({ label: "Contributor", collection: "people" }), {
		label: "Contributors",
	}),
	meta: fields.object({
		label: "Meta",
		fields: { related: fields.reference({ label: "Related", collection: "news" }) },
	}),
	sections: fields.blocks({ label: "Sections", blocks: { person } }),
	content: fields.richText({ label: "Content", nodes: ["blockquote"], blocks: { person } }),
};

test("collects references from all nested fields", () => {
	const references = collectReferences(schema, {
		author: "jane",
		contributors: ["john", "jane"],
		meta: { related: "kick-off" },
		sections: [{ type: "person", data: { person: "max" } }],
		content: {
			type: "doc",
			content: [
				{ type: "paragraph" },
				{ type: "person", attrs: { person: "erika" } },
				{ type: "blockquote", content: [{ type: "person", attrs: { person: "john" } }] },
			],
		},
	});

	expect(references).toEqual([
		{ collection: "people", id: "jane", path: "author" },
		{ collection: "people", id: "john", path: "contributors[0]" },
		{ collection: "people", id: "jane", path: "contributors[1]" },
		{ collection: "news", id: "kick-off", path: "meta.related" },
		{ collection: "people", id: "max", path: "sections<person>[0].person" },
		{ collection: "people", id: "erika", path: "content<person>[0].person" },
		{ collection: "people", id: "john", path: "content<person>[1].person" },
	]);
});

test("skips missing optional values", () => {
	expect(
		collectReferences(schema, {
			contributors: [],
			meta: { related: "kick-off" },
			sections: [],
			content: { type: "doc", content: [] },
		}),
	).toEqual([{ collection: "news", id: "kick-off", path: "meta.related" }]);
});
