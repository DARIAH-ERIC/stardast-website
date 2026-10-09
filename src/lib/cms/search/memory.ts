import MiniSearch from "minisearch";

import { createSnippet, normalizeTerm } from "#/src/lib/cms/search/snippet.ts";
import type { SearchBackend, SearchDocument } from "#/src/lib/cms/search/types.ts";

/**
 * Searches an index held in memory, rebuilt in milliseconds for a few thousand documents. Every server process holds
 * its own index, so that this suits a single replica - use an external search engine with several.
 */
export function createMemorySearchBackend(): SearchBackend {
	let index: MiniSearch<SearchDocument> | undefined;
	let indexedRevision: string | undefined;

	return {
		name: "memory",

		getRevision() {
			return Promise.resolve(indexedRevision);
		},

		replaceAll({ documents, revision }) {
			const next = new MiniSearch<SearchDocument>({
				fields: ["title", "text"],
				storeFields: ["type", "title", "url", "text"],
				processTerm: normalizeTerm,
				searchOptions: {
					boost: { title: 3 },
					/** All words must match, as in most site searches - with prefix and fuzzy matching for longer words. */
					combineWith: "AND",
					prefix: (term) => term.length >= 3,
					fuzzy: (term) => (term.length >= 5 ? 0.2 : false),
				},
			});

			next.addAll(documents);

			/** Swapped as a whole, so that searches never see a half-built index. */
			index = next;
			indexedRevision = revision;

			return Promise.resolve();
		},

		search({ query, types, page, perPage }) {
			const results = index?.search(query) ?? [];

			const counts: Record<string, number> = {};

			for (const result of results) {
				const type = result.type as string;
				counts[type] = (counts[type] ?? 0) + 1;
			}

			const filtered =
				types != null && types.length > 0 ? results.filter((result) => types.includes(result.type as string)) : results;

			const hits = filtered.slice((page - 1) * perPage, page * perPage).map((result) => {
				return {
					document: {
						id: result.id as string,
						type: result.type as string,
						title: result.title as string,
						url: result.url as string,
					},
					snippet: createSnippet(result.text as string, result.terms),
				};
			});

			return Promise.resolve({ hits, total: filtered.length, counts });
		},
	};
}
