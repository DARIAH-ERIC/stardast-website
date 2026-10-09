import { describe, expect, expectTypeOf, test } from "bun:test";

import * as v from "valibot";

import {
	type InferEntry,
	type RichTextDocument,
	block,
	collection,
	defineConfig,
	fields,
	forEachField,
	optional,
} from "#/src/lib/cms/schema/index.ts";

describe("fields", () => {
	test("text trims, and applies additional validation", () => {
		const field = fields.text({ label: "Title", validation: [v.minLength(1)] });

		expect(v.parse(field.schema, "  Title  ")).toBe("Title");
		expect(v.is(field.schema, "   ")).toBe(false);
	});

	test("optional fields accept a missing value, and have no default value", () => {
		const field = optional(fields.email({ label: "Email" }));

		expect(field.optional).toBe(true);
		expect(field.kind).toBe("email");
		expect(field.defaultValue()).toBeUndefined();
		expect(v.is(field.schema, undefined)).toBe(true);
		expect(v.is(field.schema, "not an email")).toBe(false);
	});

	test("date only accepts iso dates", () => {
		const field = fields.date({ label: "Date" });

		expect(v.is(field.schema, "2026-10-09")).toBe(true);
		expect(v.is(field.schema, "09.10.2026")).toBe(false);
	});

	test("multi select rejects unknown values and duplicates", () => {
		const field = fields.multiSelect({
			label: "Tags",
			options: [
				{ value: "a", label: "A" },
				{ value: "b", label: "B" },
			],
		});

		expect(v.is(field.schema, ["a", "b"])).toBe(true);
		expect(v.is(field.schema, ["a", "c"])).toBe(false);
		expect(v.is(field.schema, ["a", "a"])).toBe(false);
	});

	test("references only accept valid entry ids", () => {
		const field = fields.reference({ label: "Author", collection: "people" });

		expect(v.is(field.schema, "jane-doe")).toBe(true);
		expect(v.is(field.schema, "../jane-doe")).toBe(false);
		expect(v.is(field.schema, "Jane Doe")).toBe(false);
	});

	test("blocks are stored as `type` and `data`", () => {
		const field = fields.blocks({
			label: "Sections",
			blocks: {
				quote: block({ label: "Quote", fields: { text: fields.text({ label: "Text" }) } }),
			},
		});

		expect(v.is(field.schema, [{ type: "quote", data: { text: "Hello" } }])).toBe(true);
		expect(v.is(field.schema, [{ type: "unknown", data: {} }])).toBe(false);
		expect(v.is(field.schema, [{ type: "quote", data: { text: 1 } }])).toBe(false);
	});
});

function doc(...content: Array<unknown>) {
	return { type: "doc", content };
}

function paragraph(...content: Array<unknown>) {
	return { type: "paragraph", content };
}

function heading(level: number) {
	return doc({ type: "heading", attrs: { level }, content: [{ type: "text", text: "x" }] });
}

function link(href: string) {
	return doc(paragraph({ type: "text", text: "x", marks: [{ type: "link", attrs: { href } }] }));
}

describe("rich text", () => {
	const field = fields.richText({
		label: "Content",
		marks: ["bold", "link"],
		nodes: ["heading", "bulletList"],
		blocks: {
			callout: block({ label: "Callout", fields: { text: fields.text({ label: "Text" }) } }),
		},
	});

	test("accepts allowed nodes, marks, and blocks", () => {
		const value = doc(
			{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Heading" }] },
			paragraph(
				{ type: "text", text: "bold", marks: [{ type: "bold" }] },
				{ type: "hardBreak" },
				{ type: "text", text: "link", marks: [{ type: "link", attrs: { href: "https://example.org" } }] },
			),
			{
				type: "bulletList",
				content: [{ type: "listItem", content: [paragraph({ type: "text", text: "item" })] }],
			},
			{ type: "callout", attrs: { text: "Note" } },
		);

		expect(v.safeParse(field.schema, value).issues).toBeUndefined();
	});

	test("the default value is valid", () => {
		expect(v.is(field.schema, field.defaultValue())).toBe(true);
	});

	test("rejects nodes and marks which are not enabled", () => {
		expect(v.is(field.schema, doc({ type: "blockquote", content: [paragraph()] }))).toBe(false);
		expect(v.is(field.schema, doc(paragraph({ type: "text", text: "x", marks: [{ type: "italic" }] })))).toBe(false);
	});

	test("rejects invalid nesting", () => {
		expect(v.is(field.schema, doc({ type: "text", text: "top-level text" }))).toBe(false);
		expect(v.is(field.schema, doc({ type: "bulletList", content: [paragraph()] }))).toBe(false);
		expect(v.is(field.schema, doc({ type: "bulletList", content: [] }))).toBe(false);
		expect(v.is(field.schema, doc(paragraph(paragraph())))).toBe(false);
	});

	test("rejects heading levels which are not enabled", () => {
		expect(v.is(field.schema, heading(2))).toBe(true);
		expect(v.is(field.schema, heading(1))).toBe(false);
	});

	test("rejects unsafe link urls", () => {
		expect(v.is(field.schema, link("/news"))).toBe(true);
		expect(v.is(field.schema, link("mailto:info@example.org"))).toBe(true);
		expect(v.is(field.schema, link("javascript:alert(1)"))).toBe(false);
		expect(v.is(field.schema, link("//example.org"))).toBe(false);
	});

	test("validates block attributes with the block's fields", () => {
		expect(v.is(field.schema, doc({ type: "callout", attrs: {} }))).toBe(false);
	});

	test("strips unknown attributes", () => {
		const value = doc(
			paragraph({
				type: "text",
				text: "x",
				marks: [{ type: "link", attrs: { href: "/news", target: "_blank", class: null } }],
			}),
		);

		expect(v.parse(field.schema, value)).toEqual(
			doc(
				paragraph({ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "/news" } }] }),
			) as RichTextDocument,
		);
	});

	test("rejects blocks named like built-in nodes", () => {
		expect(() =>
			fields.richText({
				label: "Content",
				blocks: { paragraph: block({ label: "Paragraph", fields: {} }) },
			}),
		).toThrow(/built-in node/);
	});
});

describe("config", () => {
	const people = collection({
		label: "People",
		path: "content/people",
		slug: { from: "name" },
		fields: { name: fields.text({ label: "Name" }) },
	});

	test("rejects overlapping paths", () => {
		expect(() =>
			defineConfig({
				collections: { people, nested: { ...people, path: "content/people/nested" } },
			}),
		).toThrow(/overlaps/);
	});

	test("rejects paths outside of the content directory", () => {
		expect(() => defineConfig({ collections: { people: { ...people, path: "src/people" } } })).toThrow(
			/below "content\/"/,
		);
	});

	test("rejects references to unknown collections", () => {
		const news = collection({
			label: "News",
			path: "content/news",
			slug: { from: "title" },
			fields: {
				title: fields.text({ label: "Title" }),
				authors: fields.array(fields.reference({ label: "Author", collection: "authors" }), { label: "Authors" }),
			},
		});

		expect(() => defineConfig({ collections: { news, people } })).toThrow(
			/"news\.authors\[\]" references unknown collection "authors"/,
		);
	});

	test("visits nested fields", () => {
		const paths: Array<string> = [];

		forEachField(
			{
				meta: fields.object({ label: "Meta", fields: { title: fields.text({ label: "Title" }) } }),
				content: fields.richText({
					label: "Content",
					blocks: { callout: block({ label: "Callout", fields: { text: fields.text({ label: "Text" }) } }) },
				}),
			},
			(_field, path) => {
				paths.push(path);
			},
		);

		expect(paths).toEqual(["meta", "meta.title", "content", "content<callout>.text"]);
	});

	test("default values contain every field which is not optional", () => {
		const item = collection({
			label: "Items",
			path: "content/items",
			slug: { from: "title" },
			fields: {
				title: fields.text({ label: "Title" }),
				subtitle: optional(fields.text({ label: "Subtitle" })),
				featured: fields.boolean({ label: "Featured" }),
			},
		});

		expect(item.defaultValue()).toEqual({ title: "", featured: false });
	});

	test("infers entry types", () => {
		const news = collection({
			label: "News",
			path: "content/news",
			slug: { from: "title" },
			fields: {
				title: fields.text({ label: "Title" }),
				subtitle: optional(fields.text({ label: "Subtitle" })),
				tags: fields.multiSelect({
					label: "Tags",
					options: [
						{ value: "event", label: "Event" },
						{ value: "call", label: "Call" },
					],
				}),
				authors: fields.array(fields.reference({ label: "Author", collection: "people" }), { label: "Authors" }),
				content: fields.richText({ label: "Content" }),
			},
		});

		expectTypeOf<InferEntry<typeof news>>().toEqualTypeOf<{
			title: string;
			subtitle?: string | undefined;
			tags: Array<"call" | "event">;
			authors: Array<string>;
			content: RichTextDocument;
		}>();
	});
});
