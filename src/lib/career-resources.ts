import type { resourceCategories } from "#/src/cms/config.ts";
import { type ZenodoRecord, summarize } from "#/src/lib/zenodo.ts";

export type ResourceCategory = (typeof resourceCategories)[number]["value"];

export interface Resource {
	id: string;
	title: string;
	summary?: string;
	/** A year, month or day, e.g. `2026`, `2026-10` or `2026-10-01`. */
	publicationDate: string;
	/** The record on zenodo - resources have no pages of their own. */
	href: string;
}

/** In seconds - how long pages which list resources are cached, and so how soon new records on zenodo show up. */
export const resourcesMaxAge = 60 * 60;

/** In seconds - pages which could not list resources, because zenodo failed, are rendered again sooner. */
export const resourcesRetryAfter = 60;

export function hasKeyword(record: Pick<ZenodoRecord, "keywords">, keyword: string): boolean {
	const normalized = keyword.trim().toLowerCase();

	return record.keywords.some((value) => value.trim().toLowerCase() === normalized);
}

export function toResource(record: ZenodoRecord): Resource {
	const summary = record.description != null ? summarize(record.description, 200) : "";

	return {
		id: record.id,
		title: record.title,
		summary: summary !== "" ? summary : undefined,
		publicationDate: record.publicationDate,
		href: record.url,
	};
}
