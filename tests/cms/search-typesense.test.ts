import { expect, test } from "bun:test";

import type { SearchDocument } from "#/src/lib/cms/search/types.ts";
import { type Fetch, createTypesenseSearchBackend } from "#/src/lib/cms/search/typesense.ts";
import { getRejection } from "#/tests/helpers.ts";

/** Implements the few endpoints the backend uses, and records the requests. */
function createFakeTypesense(options: { failImport?: boolean } = {}) {
	const collections = new Map<string, Array<SearchDocument>>();
	const aliases = new Map<string, string>();
	const requests: Array<{ method: string; path: string; body?: unknown; headers: Headers }> = [];

	function handle(url: URL, init: RequestInit): Response {
		const method = init.method ?? "GET";
		const path = decodeURIComponent(url.pathname);
		const text = typeof init.body === "string" ? init.body : undefined;
		const body =
			text != null && new Headers(init.headers).get("content-type") === "application/json"
				? (JSON.parse(text) as unknown)
				: text;
		requests.push({ method, path, body, headers: new Headers(init.headers) });

		let match: RegExpMatchArray | null;

		if ((match = /^\/aliases\/(?<alias>.+)$/.exec(path))) {
			if (method === "PUT") {
				aliases.set(match.groups!.alias!, (body as { collection_name: string }).collection_name);
				return Response.json({});
			}
			const target = aliases.get(match.groups!.alias!);
			return target == null
				? Response.json({ message: "Not found" }, { status: 404 })
				: Response.json({ name: match.groups!.alias, collection_name: target });
		}

		if (path === "/collections" && method === "POST") {
			collections.set((body as { name: string }).name, []);
			return Response.json({}, { status: 201 });
		}

		if ((match = /^\/collections\/(?<name>[^/]+)\/documents\/import$/.exec(path))) {
			const documents = (body as string).split("\n").map((line) => JSON.parse(line) as SearchDocument);
			collections.get(match.groups!.name!)!.push(...documents);
			return new Response(
				documents
					.map((_, index) =>
						JSON.stringify(
							options.failImport === true && index === 0
								? { success: false, error: "Bad document" }
								: { success: true },
						),
					)
					.join("\n"),
			);
		}

		if ((match = /^\/collections\/(?<name>[^/]+)$/.exec(path)) && method === "DELETE") {
			return collections.delete(match.groups!.name!) ? Response.json({}) : Response.json({}, { status: 404 });
		}

		if (path === "/multi_search") {
			return Response.json({
				results: [
					{
						found: 12,
						hits: [
							{
								document: { id: "news:a", type: "news", title: "Data stewards", url: "/news/a", text: "Long text." },
								highlights: [{ field: "text", snippet: "The \u0002data\u0003 stewards met." }],
							},
							{
								document: {
									id: "partners:b",
									type: "partners",
									title: "Data partner",
									url: "/about#partners",
									text: "No match in the text.",
								},
								highlights: [],
							},
						],
					},
					{
						found: 15,
						hits: [],
						facet_counts: [
							{
								field_name: "type",
								counts: [
									{ value: "news", count: 12 },
									{ value: "partners", count: 3 },
								],
							},
						],
					},
				],
			});
		}

		return Response.json({ message: "Unexpected request" }, { status: 500 });
	}

	const fetch: Fetch = (url, init = {}) => Promise.resolve(handle(url, init));

	return { fetch, collections, aliases, requests, options };
}

const documents: Array<SearchDocument> = [
	{ id: "news:a", type: "news", title: "A", text: "Text a.", url: "/news/a" },
	{ id: "news:b", type: "news", title: "B", text: "Text b.", url: "/news/b" },
];

test("replacing all documents builds a new collection, switches the alias, and deletes the previous collection", async () => {
	const typesense = createFakeTypesense();
	let now = 1000;
	const backend = createTypesenseSearchBackend({
		url: "https://typesense.example.org",
		apiKey: "secret",
		collection: "stardast",
		fetch: typesense.fetch,
		now: () => now,
	});

	expect(await backend.getRevision()).toBeUndefined();

	await backend.replaceAll({ documents, revision: "abc:def" });
	const first = typesense.aliases.get("stardast")!;
	expect(typesense.collections.get(first)).toEqual(documents);
	expect(await backend.getRevision()).toBe("abc:def");

	now = 2000;
	await backend.replaceAll({ documents: documents.slice(0, 1), revision: "ghi" });
	const second = typesense.aliases.get("stardast")!;
	expect(second).not.toBe(first);
	expect([...typesense.collections.keys()]).toEqual([second]);
	expect(await backend.getRevision()).toBe("ghi");

	expect(typesense.requests.every((request) => request.headers.get("x-typesense-api-key") === "secret")).toBe(true);
});

test("a failed import deletes the new collection, and keeps the alias on the previous one", async () => {
	const typesense = createFakeTypesense();
	const backend = createTypesenseSearchBackend({
		url: "https://typesense.example.org",
		apiKey: "secret",
		collection: "stardast",
		fetch: typesense.fetch,
	});
	await backend.replaceAll({ documents, revision: "1" });
	const previous = typesense.aliases.get("stardast");

	typesense.options.failImport = true;
	expect(String(await getRejection(backend.replaceAll({ documents, revision: "2" })))).toContain("could not import");

	expect(typesense.aliases.get("stardast")).toBe(previous);
	expect([...typesense.collections.keys()]).toEqual([previous!]);
	expect(await backend.getRevision()).toBe("1");
});

test("searches with a type filter, counts types without it, and turns highlights into snippet segments", async () => {
	const typesense = createFakeTypesense();
	const backend = createTypesenseSearchBackend({
		url: "https://typesense.example.org/",
		apiKey: "secret",
		collection: "stardast",
		fetch: typesense.fetch,
	});

	const results = await backend.search({ query: "data", types: ["news", "events"], page: 2, perPage: 10 });

	const [filtered, facets] = (typesense.requests.at(-1)!.body as { searches: Array<Record<string, unknown>> }).searches;
	expect(filtered).toMatchObject({
		collection: "stardast",
		q: "data",
		filter_by: "type:=[`news`,`events`]",
		page: 2,
		per_page: 10,
	});
	expect(facets).toMatchObject({ collection: "stardast", q: "data", facet_by: "type", per_page: 0 });
	expect(facets).not.toHaveProperty("filter_by");

	expect(results.total).toBe(12);
	expect(results.counts).toEqual({ news: 12, partners: 3 });
	expect(results.hits[0]).toEqual({
		document: { id: "news:a", type: "news", title: "Data stewards", url: "/news/a" },
		snippet: [
			{ text: "The ", highlight: false },
			{ text: "data", highlight: true },
			{ text: " stewards met.", highlight: false },
		],
	});
	expect(results.hits[1]!.snippet).toEqual([{ text: "No match in the text.", highlight: false }]);
});
