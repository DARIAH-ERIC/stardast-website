import type { SearchBackend, SearchDocument, SearchQuery, SearchResults } from "#/src/lib/cms/search/types.ts";

export interface SearchIndex {
	readonly backend: SearchBackend;
	/** Rebuilds the index if it is stale, then searches it. */
	search: (query: SearchQuery) => Promise<SearchResults>;
	/** E.g. after publishing, when the published revision may not change - as with filesystem storage. */
	markStale: () => void;
	/** Rebuilds the index if it is stale - e.g. right after a change, so that the next search does not wait for it. */
	sync: () => Promise<void>;
}

/**
 * Keeps a search backend in sync with the published content. The index is rebuilt as a whole, from all documents, when
 * the published revision differs from the one it was built from, or when it was marked stale. Rebuilds are
 * deduplicated, and a failed rebuild keeps serving the previous index, if there is one.
 */
export function createSearchIndex(params: {
	backend: SearchBackend;
	/** The current published revision. */
	getRevision: () => Promise<string>;
	loadDocuments: () => Promise<Array<SearchDocument>>;
	/** Rebuilds before every search, e.g. in development, where content files may be edited by hand. */
	alwaysStale?: boolean;
	onError?: (error: unknown) => void;
}): SearchIndex {
	const { backend, getRevision, loadDocuments, alwaysStale = false, onError } = params;

	/** `null` until asked from the backend - which may already hold an index, e.g. built by another process. */
	let indexedRevision: string | undefined | null = null;
	let isStale = false;
	let syncing: Promise<void> | null = null;

	async function rebuild(): Promise<void> {
		const revision = await getRevision();

		indexedRevision ??= await backend.getRevision();

		if (!isStale && !alwaysStale && indexedRevision === revision) {
			return;
		}

		/** Reset before loading, so that changes during the rebuild mark it stale again. */
		isStale = false;

		try {
			await backend.replaceAll({ documents: await loadDocuments(), revision });
			indexedRevision = revision;
		} catch (error) {
			isStale = true;

			if (indexedRevision == null) {
				throw error;
			}

			onError?.(error);
		}
	}

	function sync(): Promise<void> {
		syncing ??= rebuild().finally(() => {
			syncing = null;
		});

		return syncing;
	}

	return {
		backend,

		async search(query) {
			await sync();

			return backend.search(query);
		},

		markStale() {
			isStale = true;
		},

		sync,
	};
}
