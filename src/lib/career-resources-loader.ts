import { Result } from "better-result";

import { env } from "#/configs/env.config.ts";
import { resourceCategories } from "#/src/cms/config.ts";
import { zenodoCommunity } from "#/src/config/project.ts";
import { createCachedLoader } from "#/src/lib/cached-loader.ts";
import {
	type Resource,
	type ResourceCategory,
	hasKeyword,
	resourcesMaxAge,
	resourcesRetryAfter,
	toResource,
} from "#/src/lib/career-resources.ts";
import { type ZenodoError, createZenodoClient } from "#/src/lib/zenodo.ts";

const client = createZenodoClient({ token: env.ZENODO_TOKEN });

/** One request for all sections, rather than one per section - zenodo rate limits requests, more so without a token. */
const records = createCachedLoader({
	load: () => client.listCommunityRecords(zenodoCommunity),
	maxAge: resourcesMaxAge * 1000,
	retryAfter: resourcesRetryAfter * 1000,
	onError(error) {
		// oxlint-disable-next-line no-console
		console.error(`Loading the records of the zenodo community "${zenodoCommunity}" failed:`, error.message);
	},
});

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
