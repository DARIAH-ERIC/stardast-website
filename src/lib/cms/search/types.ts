/**
 * Site search, with interchangeable backends: an in-memory index by default, or an external search engine. The index is
 * always rebuilt as a whole - see `createSearchIndex()` - which keeps backends simple, and is fast enough for the
 * hundreds to low thousands of documents of a typical cms site.
 */

/** One search result - e.g. an entry, or an anchored section of a page. */
export interface SearchDocument {
	/** Unique across all types, e.g. `news:project-kick-off`, or `pages:about#objectives`. */
	id: string;
	/** Used to filter results, e.g. `news` - and counted per type, for filters with result counts. */
	type: string;
	title: string;
	/** Plain text, searched and excerpted for snippets. */
	text: string;
	/** Where the result links to, e.g. `/about#objectives`. */
	url: string;
}

export interface SearchQuery {
	/** Trimmed, and not empty. */
	query: string;
	/** Only returns results of these types. Counts per type are not filtered by it. */
	types?: ReadonlyArray<string>;
	/** 1-based. */
	page: number;
	perPage: number;
}

/** A piece of a snippet, highlighted if it matches the query - so that snippets render without html. */
export interface SnippetSegment {
	text: string;
	highlight: boolean;
}

export interface SearchHit {
	document: Omit<SearchDocument, "text">;
	snippet: Array<SnippetSegment>;
}

export interface SearchResults {
	hits: Array<SearchHit>;
	/** Of results matching the type filter, across all pages. */
	total: number;
	/** Results per type, ignoring the type filter - e.g. for filter links with counts. */
	counts: Record<string, number>;
}

export interface SearchBackend {
	readonly name: string;
	/** The content revision the index was built from, or `undefined` if there is no index yet. */
	getRevision: () => Promise<string | undefined>;
	/** Replaces all documents, atomically - searches see either the old or the new index. */
	replaceAll: (params: { documents: ReadonlyArray<SearchDocument>; revision: string }) => Promise<void>;
	search: (query: SearchQuery) => Promise<SearchResults>;
}
