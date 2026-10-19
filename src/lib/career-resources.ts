import { Result } from "better-result";

import { resourceCategories } from "#/src/cms/config.ts";
import { zenodoCommunity } from "#/src/config/project.ts";
import { createCachedLoader } from "#/src/lib/cached-loader.ts";
import { type ZenodoError, type ZenodoRecord, createZenodoClient, summarize } from "#/src/lib/zenodo.ts";

export type ResourceCategory = (typeof resourceCategories)[number]["value"];

export interface Resource {
	id: string;
	title: string;
	summary?: string;
	/** A calendar day, e.g. `2026-10-01`. */
	publicationDate: string;
	/** The record on zenodo - resources have no pages of their own. */
	href: string;
}

/** In seconds - how long pages which list resources are cached, and so how soon new records on zenodo show up. */
export const resourcesMaxAge = 60 * 60;

/** In seconds - pages which could not list resources, because zenodo failed, are rendered again sooner. */
export const resourcesRetryAfter = 60;

const client = createZenodoClient();

/** One request for all sections, rather than one per section - zenodo rate limits requests without an access token. */
const records = createCachedLoader({
	load: () => client.listCommunityRecords(zenodoCommunity),
	maxAge: resourcesMaxAge * 1000,
	retryAfter: resourcesRetryAfter * 1000,
	onError(error) {
		// oxlint-disable-next-line no-console
		console.error(`Loading the records of the zenodo community "${zenodoCommunity}" failed:`, error.message);
	},
});

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

/** The resources of one category, newest first. */
export async function getResources(category: ResourceCategory): Promise<Result<Array<Resource>, ZenodoError>> {
	const { keyword } = resourceCategories.find((option) => option.value === category)!;

	const result = await records.get();

	if (result.isErr()) {
		return Result.err(result.error);
	}

	/** Zenodo's `newest` is by upload, rather than publication date - e.g. for a report uploaded years later. */
	return Result.ok(
		result.value
			.filter((record) => hasKeyword(record, keyword))
			.map((record) => toResource(record))
			.toSorted((a, b) => b.publicationDate.localeCompare(a.publicationDate)),
	);
}
