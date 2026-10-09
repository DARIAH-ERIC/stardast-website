import type { APIContext } from "astro";

import { cacheTags } from "#/src/lib/cms/cache.ts";
import { type Reader, createReader } from "#/src/lib/cms/reader.ts";
import type { Config } from "#/src/lib/cms/schema/config.ts";
import type { ContentStorage } from "#/src/lib/cms/storage/types.ts";

/**
 * Content changes are pushed to the cache by tag invalidation, so `maxAge` is only a safety net, e.g. for a missed
 * webhook. Note that the memory cache provider only stores responses which have a `maxAge`.
 */
const defaultMaxAge = 24 * 60 * 60;

/**
 * After `maxAge`, a cached page is served stale while it re-renders in the background - and stays cached if that fails,
 * e.g. because github is down or rate limiting. Changed content is still shown right away, since tag invalidation
 * removes pages from the cache, rather than marking them stale.
 */
const defaultStaleWhileRevalidate = 7 * 24 * 60 * 60;

/**
 * Creates a reader which tags the current response with everything it reads. Pages which set their own `maxAge` keep
 * it, and its `swr`.
 *
 * `cache.set()` re-enables caching after `cache.set(false)`, so readers for previews must not be created with this.
 */
export function createCachedReader<TConfig extends Config>(params: {
	config: TConfig;
	storage: ContentStorage;
	context: Pick<APIContext, "cache">;
	maxAge?: number;
	staleWhileRevalidate?: number;
}): Reader<TConfig> {
	const {
		config,
		storage,
		context,
		maxAge = defaultMaxAge,
		staleWhileRevalidate = defaultStaleWhileRevalidate,
	} = params;

	return createReader({
		config,
		storage,
		onRead(tags) {
			context.cache.set({ tags: [cacheTags.all, ...tags] });

			if (context.cache.options.maxAge === undefined) {
				context.cache.set({ maxAge, swr: staleWhileRevalidate });
			}
		},
	});
}

/**
 * Shortens how long the current page is cached, e.g. for a page which lists upcoming events. Only shortens a `maxAge`
 * already set by a cached reader, so that it never enables caching, e.g. of previews - call it after reading content.
 */
export function limitMaxAge(context: Pick<APIContext, "cache">, maxAge: number): void {
	const current = context.cache.options.maxAge;

	if (current !== undefined && maxAge < current) {
		context.cache.set({ maxAge });
	}
}
