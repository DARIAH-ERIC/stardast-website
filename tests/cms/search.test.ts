import { expect, test } from "bun:test";

import * as v from "valibot";

import { block } from "#/src/lib/cms/schema/fields.ts";
import { fields } from "#/src/lib/cms/schema/index.ts";
import { createSearchIndex } from "#/src/lib/cms/search/index.ts";
import { createMemorySearchBackend } from "#/src/lib/cms/search/memory.ts";
import { createSnippet } from "#/src/lib/cms/search/snippet.ts";
import { extractText } from "#/src/lib/cms/search/text.ts";
import type { SearchBackend, SearchDocument } from "#/src/lib/cms/search/types.ts";
import { getRejection } from "#/tests/helpers.ts";

test("extracts the text of text fields, rich text, and rich text blocks - and nothing else", () => {
	const callout = block({
		label: "Callout",
		fields: {
			tone: fields.select({ label: "Tone", options: [{ value: "info", label: "Info" }], defaultValue: "info" }),
			text: fields.textarea({ label: "Text" }),
		},
	});
	const figure = block({ label: "Figure", fields: { image: fields.image({ label: "Image" }) } });
	const schema = {
		title: fields.text({ label: "Title" }),
		website: fields.url({ label: "Website" }),
		image: fields.image({ label: "Image" }),
		links: fields.array(
			fields.object({
				label: "Link",
				fields: { label: fields.text({ label: "Label" }), href: fields.text({ label: "Href" }) },
			}),
			{ label: "Links" },
		),
		sections: fields.blocks({
			label: "Sections",
			blocks: {
				text: block({
					label: "Text",
					fields: { lead: fields.textarea({ label: "Lead", validation: [v.maxLength(500)] }) },
				}),
			},
		}),
		content: fields.richText({ label: "Content", blocks: { callout, figure } }),
	};

	const text = extractText(schema, {
		title: "Data stewards",
		website: "https://example.org",
		image: "photo-abc123",
		links: [{ label: "About", href: "/about" }],
		sections: [
			{ type: "text", data: { lead: "A lead." } },
			{ type: "unknown", data: { lead: "Skipped." } },
		],
		content: {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "A " },
						{ type: "text", text: "bold", marks: [{ type: "bold" }] },
						{ type: "text", text: " word." },
					],
				},
				{
					type: "bulletList",
					content: [
						{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "An item." }] }] },
					],
				},
				{ type: "callout", attrs: { tone: "info", text: "A callout." } },
				{ type: "figure", attrs: { image: "photo-abc123" } },
			],
		},
	});

	expect(text.split("\n")).toEqual([
		"Data stewards",
		"About",
		"/about",
		"A lead.",
		"A bold word.",
		"An item.",
		"A callout.",
	]);

	expect(extractText(schema, { links: [{ label: "About", href: "/about" }] }, { skip: ["href"] })).toBe("About");
});

test("snippets excerpt around the first match, and highlight matches ignoring case and diacritics", () => {
	const text = `${"Lorem ipsum dolor sit amet. ".repeat(10)}The Koç University joins STARDAST. Koç is in Istanbul.`;
	const snippet = createSnippet(text, ["koc"], 120);

	expect(snippet[0]!.text).toStartWith("… ");
	expect(snippet.filter((segment) => segment.highlight).map((segment) => segment.text)).toEqual(["Koç", "Koç"]);
	expect(snippet.map((segment) => segment.text).join("").length).toBeLessThanOrEqual(124);

	expect(createSnippet("Short text.", ["missing"])).toEqual([{ text: "Short text.", highlight: false }]);
});

const documents: Array<SearchDocument> = [
	{ id: "news:a", type: "news", title: "Data stewards meet", text: "The consortium met in Vienna.", url: "/news/a" },
	{
		id: "news:b",
		type: "news",
		title: "Call for contributions",
		text: "Data stewards are invited to contribute.",
		url: "/news/b",
	},
	{ id: "events:c", type: "events", title: "Workshop", text: "A workshop for data stewardship.", url: "/events/c" },
	{ id: "partners:d", type: "partners", title: "Koç University", text: "KUTTAM", url: "/about#partners" },
];

test("the memory backend ranks title matches first, and matches prefixes, typos, and diacritics", async () => {
	const backend = createMemorySearchBackend();
	await backend.replaceAll({ documents, revision: "1" });

	const results = await backend.search({ query: "data stewards", page: 1, perPage: 10 });
	expect(results.hits[0]!.document.id).toBe("news:a");
	expect(results.total).toBe(3);
	expect(results.counts).toEqual({ news: 2, events: 1 });

	expect((await backend.search({ query: "consort", page: 1, perPage: 10 })).hits.map((hit) => hit.document.id)).toEqual(
		["news:a"],
	);
	expect((await backend.search({ query: "workshp", page: 1, perPage: 10 })).hits.map((hit) => hit.document.id)).toEqual(
		["events:c"],
	);
	expect((await backend.search({ query: "koc", page: 1, perPage: 10 })).hits.map((hit) => hit.document.id)).toEqual([
		"partners:d",
	]);
});

test("the memory backend filters by type and paginates, but counts all types", async () => {
	const backend = createMemorySearchBackend();
	await backend.replaceAll({ documents, revision: "1" });

	const results = await backend.search({ query: "data", types: ["news"], page: 2, perPage: 1 });
	expect(results.total).toBe(2);
	expect(results.hits).toHaveLength(1);
	expect(results.counts).toEqual({ news: 2, events: 1 });
	expect(results.hits[0]!.snippet.some((segment) => segment.highlight)).toBe(true);
});

function createFakeBackend(initialRevision?: string) {
	const builds: Array<string> = [];
	let revision = initialRevision;

	const backend: SearchBackend = {
		name: "fake",
		getRevision: () => Promise.resolve(revision),
		replaceAll(params) {
			builds.push(params.revision);
			revision = params.revision;
			return Promise.resolve();
		},
		search: () => Promise.resolve({ hits: [], total: 0, counts: {} }),
	};

	return { backend, builds };
}

const query = { query: "x", page: 1, perPage: 10 };

test("the index rebuilds when the revision changes, or when marked stale - and not otherwise", async () => {
	const { backend, builds } = createFakeBackend();
	let revision = "1";
	const index = createSearchIndex({
		backend,
		getRevision: () => Promise.resolve(revision),
		loadDocuments: () => Promise.resolve([]),
	});

	await index.search(query);
	await index.search(query);
	expect(builds).toEqual(["1"]);

	revision = "2";
	await index.search(query);
	expect(builds).toEqual(["1", "2"]);

	index.markStale();
	await index.search(query);
	await index.search(query);
	expect(builds).toEqual(["1", "2", "2"]);
});

test("the index reuses an index the backend already holds for the current revision, e.g. built by another process", async () => {
	const { backend, builds } = createFakeBackend("1");
	const index = createSearchIndex({
		backend,
		getRevision: () => Promise.resolve("1"),
		loadDocuments: () => Promise.resolve([]),
	});

	await index.search(query);
	expect(builds).toEqual([]);
});

test("concurrent searches share one rebuild", async () => {
	const { backend, builds } = createFakeBackend();
	const index = createSearchIndex({
		backend,
		getRevision: () => Promise.resolve("1"),
		loadDocuments: () => Promise.resolve([]),
	});

	await Promise.all([index.search(query), index.search(query), index.search(query)]);
	expect(builds).toEqual(["1"]);
});

test("a failed rebuild keeps serving the previous index, and retries on the next search", async () => {
	const { backend, builds } = createFakeBackend();
	const errors: Array<unknown> = [];
	let shouldFail = false;
	const index = createSearchIndex({
		backend,
		getRevision: () => Promise.resolve("1"),
		loadDocuments: () => (shouldFail ? Promise.reject(new Error("storage is down")) : Promise.resolve([])),
		onError(error) {
			errors.push(error);
		},
	});

	await index.search(query);
	shouldFail = true;
	index.markStale();
	await index.search(query);
	expect(errors).toHaveLength(1);

	shouldFail = false;
	await index.search(query);
	expect(builds).toEqual(["1", "1"]);
});

test("a failed first build fails the search, since there is no index to fall back to", async () => {
	const { backend } = createFakeBackend();
	const index = createSearchIndex({
		backend,
		getRevision: () => Promise.resolve("1"),
		loadDocuments: () => Promise.reject(new Error("storage is down")),
	});

	expect(await getRejection(index.search(query))).toBeInstanceOf(Error);
});
