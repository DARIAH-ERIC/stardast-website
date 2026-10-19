import { variantParams } from "#/src/lib/cms/media/transform.ts";
import { newsletterStatusParam } from "#/src/lib/newsletter/status.ts";

/**
 * The only query parameters in cache keys, so that e.g. `/news?x=1` is served from the cache entry of `/news`, rather
 * than filling the cache with copies of it. Every parameter which the site reads must be listed - otherwise a page
 * would be served from the cache as if it were not set. `tests/cache.test.ts` checks this.
 *
 * Responses which are never cached count too, since the cache is looked up before they are rendered: e.g. `?preview`
 * must not be served the cached public page, see `src/cms/middleware.ts`.
 */
export const cacheKeyQueryParams = [
	/** Public pages. */
	"category",
	"involvement",
	newsletterStatusParam,
	"page",
	/** Never cached. */
	"preview",
	"q",
	"type",
	/** Image variants, see `parseImageRequest()`. */
	...variantParams,
	/** Admin and api routes, which are never cached. */
	"code",
	"error",
	"returnTo",
	"state",
] as const;
