import { TaggedError } from "better-result";
import * as v from "valibot";

import type { SearchBackend, SearchDocument, SnippetSegment } from "#/src/lib/cms/search/types.ts";

/** Narrower than `typeof fetch`, so that tests can pass a plain function. */
export type Fetch = (input: URL, init?: RequestInit) => Promise<Response>;

export class TypesenseError extends TaggedError("TypesenseError")<{
	readonly message: string;
	readonly status?: number;
}> {}

/** Unlikely in content, so that snippets can be split into segments rather than rendered as html. */
const highlightStart = "\u0002";
const highlightEnd = "\u0003";

const fields = [
	{ name: "type", type: "string", facet: true },
	{ name: "title", type: "string" },
	{ name: "text", type: "string" },
	{ name: "url", type: "string", index: false, optional: true },
];

/** Collections are named `<alias>__<revision, base64url-encoded>__<timestamp>`, so that the alias tells the revision. */
function encodeRevision(revision: string): string {
	return Buffer.from(revision).toString("base64url");
}

function getCollectionName(alias: string, revision: string, now: number): string {
	return `${alias}__${encodeRevision(revision)}__${String(now)}`;
}

function parseRevision(alias: string, collectionName: string): string | undefined {
	const parts = collectionName.slice(alias.length + 2).split("__");

	if (!collectionName.startsWith(`${alias}__`) || parts.length !== 2) {
		return undefined;
	}

	return Buffer.from(parts[0]!, "base64url").toString();
}

const AliasSchema = v.object({ collection_name: v.string() });

const SearchResultSchema = v.object({
	found: v.optional(v.number(), 0),
	hits: v.optional(
		v.array(
			v.object({
				document: v.object({ id: v.string(), type: v.string(), title: v.string(), url: v.string(), text: v.string() }),
				highlights: v.optional(v.array(v.object({ field: v.string(), snippet: v.optional(v.string()) })), []),
			}),
		),
		[],
	),
	facet_counts: v.optional(
		v.array(v.object({ field_name: v.string(), counts: v.array(v.object({ value: v.string(), count: v.number() })) })),
		[],
	),
	/** Set instead of results, for a failed search of a multi-search. */
	error: v.optional(v.string()),
	code: v.optional(v.number()),
});

const MultiSearchResponseSchema = v.object({ results: v.array(SearchResultSchema) });

function toSegments(snippet: string): Array<SnippetSegment> {
	const segments: Array<SnippetSegment> = [];

	for (const [index, part] of snippet.split(new RegExp(`${highlightStart}|${highlightEnd}`)).entries()) {
		if (part !== "") {
			segments.push({ text: part, highlight: index % 2 === 1 });
		}
	}

	return segments;
}

function truncate(text: string, maxLength = 200): string {
	if (text.length <= maxLength) {
		return text;
	}

	const end = text.lastIndexOf(" ", maxLength);

	return `${text.slice(0, end > 0 ? end : maxLength)} …`;
}

/** Filter values are quoted with backticks, so that they may contain e.g. commas. */
function escapeFilterValue(value: string): string {
	return `\`${value.replaceAll("`", "")}\``;
}

async function expectOk(response: Response, action: string): Promise<Response> {
	if (!response.ok) {
		const body = await response.text().catch(() => "");

		throw new TypesenseError({
			message: `Typesense could not ${action}: ${String(response.status)} ${body}`.trim(),
			status: response.status,
		});
	}

	return response;
}

/**
 * Searches a typesense collection, behind an alias. Replacing all documents creates a new collection, and switches the
 * alias over once it is complete - so that searches never see a half-built index, and several server processes can
 * share one index. The api key needs to manage collections and aliases; it is only used on the server.
 */
export function createTypesenseSearchBackend(params: {
	/** E.g. `https://typesense.example.org`. */
	url: string;
	apiKey: string;
	/** The alias searches go to, e.g. `stardast`. */
	collection: string;
	fetch?: Fetch;
	now?: () => number;
}): SearchBackend {
	const { url, apiKey, collection: alias, fetch = globalThis.fetch, now = Date.now } = params;

	async function request(
		method: string,
		path: string,
		options: { body?: string; contentType?: string; search?: Record<string, string> } = {},
	): Promise<Response> {
		const requestUrl = new URL(path, url.endsWith("/") ? url : `${url}/`);

		for (const [key, value] of Object.entries(options.search ?? {})) {
			requestUrl.searchParams.set(key, value);
		}

		const response = await fetch(requestUrl, {
			method,
			headers: {
				"x-typesense-api-key": apiKey,
				...(options.contentType != null ? { "content-type": options.contentType } : {}),
			},
			body: options.body,
			signal: AbortSignal.timeout(30_000),
		}).catch((error: unknown) => {
			throw new TypesenseError({ message: `Request to typesense failed: ${String(error)}` });
		});

		return response;
	}

	async function getAliasTarget(): Promise<string | undefined> {
		const response = await request("GET", `aliases/${encodeURIComponent(alias)}`);

		if (response.status === 404) {
			return undefined;
		}

		const body = v.parse(AliasSchema, await (await expectOk(response, "read the alias")).json());

		return body.collection_name;
	}

	async function deleteCollection(name: string): Promise<void> {
		const response = await request("DELETE", `collections/${encodeURIComponent(name)}`);

		/** Already gone, e.g. deleted by another process. */
		if (response.status !== 404) {
			await expectOk(response, `delete collection "${name}"`);
		}
	}

	return {
		name: "typesense",

		async getRevision() {
			const target = await getAliasTarget();

			return target != null ? parseRevision(alias, target) : undefined;
		},

		async replaceAll({ documents, revision }) {
			const name = getCollectionName(alias, revision, now());
			const previous = await getAliasTarget();

			await expectOk(
				await request("POST", "collections", {
					body: JSON.stringify({ name, fields }),
					contentType: "application/json",
				}),
				`create collection "${name}"`,
			);

			try {
				if (documents.length > 0) {
					const response = await expectOk(
						await request("POST", `collections/${encodeURIComponent(name)}/documents/import`, {
							body: documents.map((document: SearchDocument) => JSON.stringify(document)).join("\n"),
							contentType: "text/plain",
							search: { action: "create" },
						}),
						"import documents",
					);

					/** Responds with one result per line, and 200 even if some documents failed. */
					const failures = (await response.text())
						.split("\n")
						.filter((line) => line.trim() !== "")
						.map((line) => JSON.parse(line) as { success: boolean; error?: string; document?: string })
						.filter((result) => !result.success);

					if (failures.length > 0) {
						throw new TypesenseError({
							message: `Typesense could not import ${String(failures.length)} documents, e.g.: ${failures[0]!.error ?? "unknown error"}`,
						});
					}
				}

				await expectOk(
					await request("PUT", `aliases/${encodeURIComponent(alias)}`, {
						body: JSON.stringify({ collection_name: name }),
						contentType: "application/json",
					}),
					"update the alias",
				);
			} catch (error) {
				await deleteCollection(name).catch(() => {
					/** The original error is more useful. */
				});

				throw error;
			}

			if (previous != null && previous !== name) {
				await deleteCollection(previous);
			}
		},

		async search({ query, types, page, perPage }) {
			const common = { collection: alias, q: query, query_by: "title,text", query_by_weights: "3,1" };

			const response = await expectOk(
				await request("POST", "multi_search", {
					body: JSON.stringify({
						searches: [
							{
								...common,
								...(types != null && types.length > 0
									? { filter_by: `type:=[${types.map(escapeFilterValue).join(",")}]` }
									: {}),
								page,
								per_page: perPage,
								include_fields: "id,type,title,url,text",
								highlight_fields: "text",
								highlight_start_tag: highlightStart,
								highlight_end_tag: highlightEnd,
								highlight_affix_num_tokens: 16,
							},
							/** Counts per type, without the type filter. */
							{ ...common, facet_by: "type", max_facet_values: 100, per_page: 0 },
						],
					}),
					contentType: "application/json",
				}),
				"search",
			);

			const { results } = v.parse(MultiSearchResponseSchema, await response.json());
			const [result, facets] = results;

			for (const item of [result, facets]) {
				if (item?.error != null) {
					throw new TypesenseError({ message: `Typesense could not search: ${item.error}`, status: item.code });
				}
			}

			const counts: Record<string, number> = {};

			for (const count of facets?.facet_counts.find((facet) => facet.field_name === "type")?.counts ?? []) {
				counts[count.value] = count.count;
			}

			return {
				total: result?.found ?? 0,
				counts,
				hits: (result?.hits ?? []).map((hit) => {
					const snippet = hit.highlights.find((highlight) => highlight.field === "text")?.snippet;
					const { text, ...document } = hit.document;

					return {
						document,
						snippet: snippet != null ? toSegments(snippet) : [{ text: truncate(text), highlight: false }],
					};
				}),
			};
		},
	};
}
