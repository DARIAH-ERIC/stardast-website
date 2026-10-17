import { env } from "#/configs/env.config.ts";
import { config } from "#/src/cms/config.ts";
import { storage } from "#/src/cms/server.ts";
import { createReader } from "#/src/lib/cms/reader.ts";
import type { Fields } from "#/src/lib/cms/schema/fields.ts";
import { createSearchIndex } from "#/src/lib/cms/search/index.ts";
import { createMemorySearchBackend } from "#/src/lib/cms/search/memory.ts";
import { extractText } from "#/src/lib/cms/search/text.ts";
import type { SearchBackend, SearchDocument } from "#/src/lib/cms/search/types.ts";
import { createTypesenseSearchBackend } from "#/src/lib/cms/search/typesense.ts";
import { publishedRef } from "#/src/lib/cms/storage/types.ts";
import { fillPartnerCount } from "#/src/lib/partner-count.ts";

/** Result types, in the order of the search page's filters. */
export const searchTypes = [
	{ value: "pages", label: "Pages" },
	{ value: "news", label: "News" },
	{ value: "events", label: "Events" },
	{ value: "resources", label: "Resources" },
	{ value: "partners", label: "Partners" },
] as const;

export type SearchType = (typeof searchTypes)[number]["value"];

/** Text fields which hold no prose. */
const skip = ["anchor", "href", "prefix"];

const sectionBlocks: Readonly<Record<string, { fields: Fields } | undefined>> =
	config.collections.pages.fields.sections.blocks;

interface SectionsValue {
	type: string;
	data: Record<string, unknown> & { anchor?: string; title?: string };
}

/**
 * A page, with each anchored section as a result of its own - so that e.g. a search for a work package links to
 * `/about#work-packages`, rather than to the top of the about page.
 */
function getPageDocuments(params: {
	id: string;
	title: string;
	url: string;
	fields: Fields;
	data: Record<string, unknown>;
	sections: ReadonlyArray<SectionsValue>;
	/** Fills the placeholder in partners sections, as on the page - see `partners-section.astro`. */
	partnerCount: number;
}): Array<SearchDocument> {
	const { id, title, url, fields, data, partnerCount } = params;

	const sections = params.sections.map((section) => {
		if (section.type !== "partners") {
			return section;
		}

		const { title: sectionTitle, lead } = section.data;

		return {
			...section,
			data: {
				...section.data,
				title: typeof sectionTitle === "string" ? fillPartnerCount(sectionTitle, partnerCount) : sectionTitle,
				lead: typeof lead === "string" ? fillPartnerCount(lead, partnerCount) : lead,
			},
		};
	});

	/** The title is the result's title, rather than part of its text - which would only repeat it in snippets. */
	const pageFields = Object.fromEntries(Object.entries(fields).filter(([name]) => name !== "sections"));
	const texts = [extractText(pageFields, { ...data, title: undefined }, { skip })];
	const documents: Array<SearchDocument> = [];

	for (const section of sections) {
		const block = sectionBlocks[section.type];

		if (block == null) {
			continue;
		}

		if (section.data.anchor != null) {
			const text = extractText(block.fields, { ...section.data, title: undefined }, { skip });

			documents.push({
				id: `pages:${id}#${section.data.anchor}`,
				type: "pages",
				title: section.data.title != null ? `${title}: ${section.data.title}` : title,
				text,
				url: `${url}#${section.data.anchor}`,
			});
		} else {
			texts.push(extractText(block.fields, section.data, { skip }));
		}
	}

	return [{ id: `pages:${id}`, type: "pages", title, text: texts.join("\n"), url }, ...documents];
}

async function loadDocuments(): Promise<Array<SearchDocument>> {
	const reader = createReader({ config, storage });

	const [home, pages, news, events, resources, partners] = await Promise.all([
		reader.singleton("home"),
		reader.list("pages"),
		reader.list("news"),
		reader.list("events"),
		reader.list("resources"),
		reader.list("partners"),
	]);

	const documents: Array<SearchDocument> = [];

	if (home != null) {
		documents.push(
			...getPageDocuments({
				id: "home",
				title: home.hero.title,
				url: "/",
				fields: config.singletons.home.fields,
				data: { ...home, hero: { ...home.hero, title: undefined } },
				sections: home.sections,
				partnerCount: partners.length,
			}),
		);
	}

	for (const page of pages) {
		documents.push(
			...getPageDocuments({
				id: page.id,
				title: page.data.title,
				url: `/${page.id}`,
				fields: config.collections.pages.fields,
				data: page.data,
				sections: page.data.sections,
				partnerCount: partners.length,
			}),
		);
	}

	for (const entry of news) {
		documents.push({
			id: `news:${entry.id}`,
			type: "news",
			title: entry.data.title,
			text: extractText(config.collections.news.fields, { ...entry.data, title: undefined }, { skip }),
			url: `/news/${entry.id}`,
		});
	}

	for (const entry of events) {
		documents.push({
			id: `events:${entry.id}`,
			type: "events",
			title: entry.data.title,
			text: extractText(config.collections.events.fields, { ...entry.data, title: undefined }, { skip }),
			url: `/events/${entry.id}`,
		});
	}

	for (const entry of resources) {
		documents.push({
			id: `resources:${entry.id}`,
			type: "resources",
			title: entry.data.title,
			text: entry.data.summary ?? "",
			/** Resources have no pages of their own - their cards link to where they are published. */
			url: entry.data.href,
		});
	}

	for (const entry of partners) {
		const { name, shortName } = entry.data;

		documents.push({
			id: `partners:${entry.id}`,
			type: "partners",
			title: shortName != null ? `${name} (${shortName})` : name,
			text: shortName ?? "",
			/** Partners have no pages of their own - they are listed on the about page. */
			url: "/about#partners",
		});
	}

	return documents;
}

function createBackend(): SearchBackend {
	const { TYPESENSE_URL, TYPESENSE_API_KEY, TYPESENSE_COLLECTION } = env;

	if (TYPESENSE_URL == null) {
		return createMemorySearchBackend();
	}

	if (TYPESENSE_API_KEY == null || TYPESENSE_COLLECTION == null) {
		throw new Error("TYPESENSE_URL requires TYPESENSE_API_KEY and TYPESENSE_COLLECTION.");
	}

	return createTypesenseSearchBackend({
		url: TYPESENSE_URL,
		apiKey: TYPESENSE_API_KEY,
		collection: TYPESENSE_COLLECTION,
	});
}

const backend = createBackend();

export const searchIndex = createSearchIndex({
	backend,
	async getRevision() {
		const revision = await storage.resolve(publishedRef);

		if (revision == null) {
			throw new Error(`Ref "${publishedRef}" does not exist.`);
		}

		return revision;
	},
	loadDocuments,
	/**
	 * With filesystem storage, the published revision never changes, and content files may be edited by hand, which does
	 * not mark the index stale - so the small in-memory index is simply rebuilt for every search in development.
	 */
	alwaysStale: import.meta.env.DEV && storage.name === "filesystem" && backend.name === "memory",
	onError(error) {
		// oxlint-disable-next-line no-console
		console.error("Rebuilding the search index failed, searching the previous one:", error);
	},
});

/** After content changes: rebuilds in the background, so that the next search does not wait for it. */
export function refreshSearchIndex(): void {
	searchIndex.markStale();

	searchIndex.sync().catch((error: unknown) => {
		// oxlint-disable-next-line no-console
		console.error("Rebuilding the search index failed:", error);
	});
}
