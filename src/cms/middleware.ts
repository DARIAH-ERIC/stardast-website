import type { MiddlewareHandler } from "astro";

import { getSession } from "#/src/cms/auth.ts";
import { config } from "#/src/cms/config.ts";
import {
	createContentReader,
	createPreviewContentReader,
	createUncachedContentReader,
	storage,
} from "#/src/cms/server.ts";
import { createDrafts } from "#/src/lib/cms/drafts.ts";

function isPathWithin(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Astro streams pages: `next()` returns once the page's frontmatter has run, and the cache reads the page's tags from
 * its headers right then - before components, e.g. `cms-image.astro`, have read, and tagged, their content. Such a page
 * would not be invalidated when e.g. an image is replaced in the media library. Buffering renders the whole page
 * first.
 *
 * Empty bodies stay empty, see the 404 handling in `src/middleware.ts`.
 */
async function renderFully(response: Response): Promise<Response> {
	if (response.body == null) {
		return response;
	}

	return new Response(await response.arrayBuffer(), response);
}

/** Reachable without a session: the sign-in page, and the sign-in flow. */
const publicAdminPaths = ["/admin/login", "/api/cms/auth"];

/**
 * Renders a public page with all drafts, for signed-in editors. Preview urls differ from public urls by the `preview`
 * query parameter, which is part of the cache key - and preview responses are never cached either, so a preview can
 * never be served to the public. Only the session decides who may preview, so the parameter needs no value.
 */
async function preview(
	context: Parameters<MiddlewareHandler>[0],
	next: Parameters<MiddlewareHandler>[1],
): Promise<Response> {
	context.cache.set(false);

	const session = await getSession(context);

	if (session == null) {
		return context.redirect(`/admin/login?returnTo=${encodeURIComponent(context.url.pathname + context.url.search)}`);
	}

	const exitUrl = new URL(context.url);
	exitUrl.searchParams.delete("preview");

	const drafts = await createDrafts({ config, storage }).list();

	context.locals.session = session;
	context.locals.content = createPreviewContentReader(drafts);
	context.locals.preview = { drafts: drafts.length, exitUrl: exitUrl.pathname + exitUrl.search };

	const response = await next();

	response.headers.set("x-robots-tag", "noindex");

	return response;
}

/**
 * Creates the content reader for the request, guards admin and cms api routes, and renders previews. Loaded by
 * `src/middleware.ts`, see there.
 */
export async function handleRequest(
	context: Parameters<MiddlewareHandler>[0],
	next: Parameters<MiddlewareHandler>[1],
): Promise<Response> {
	const { pathname } = context.url;

	const isAdmin = isPathWithin(pathname, "/admin");
	const isApi = isPathWithin(pathname, "/api/cms");

	if (!isAdmin && !isApi) {
		if (context.url.searchParams.has("preview")) {
			return preview(context, next);
		}

		/**
		 * Search results are not cached: they change with any content, rather than with what the page reads, and every
		 * query would be cached separately. Read uncached, since the cached reader would enable caching again.
		 */
		if (isPathWithin(pathname, "/search")) {
			context.cache.set(false);
			context.locals.content = createUncachedContentReader();

			return next();
		}

		/** Cheap to create: the content revision is only resolved on the first read. */
		context.locals.content = createContentReader(context);

		return renderFully(await next());
	}

	/**
	 * Responses depend on the session, so they must never be cached. Admin pages read the latest content, untagged -
	 * tagging would re-enable caching.
	 */
	context.cache.set(false);
	context.locals.content = createUncachedContentReader();

	/**
	 * Defense in depth: json requests from other origins are already blocked by cors, form posts by
	 * `security.checkOrigin`, and both by the `sameSite` session cookie. The configured site is accepted too, since
	 * behind a tls-terminating proxy the request url may be `http:`.
	 */
	if (context.request.method !== "GET") {
		const origin = context.request.headers.get("origin");

		if (origin == null || (origin !== context.url.origin && origin !== context.site?.origin)) {
			return new Response("Cross-origin requests are not allowed.", { status: 403 });
		}
	}

	context.locals.session = await getSession(context);

	if (context.locals.session == null && !publicAdminPaths.some((path) => isPathWithin(pathname, path))) {
		if (isApi) {
			return Response.json({ message: "Not signed in." }, { status: 401 });
		}

		return context.redirect(`/admin/login?returnTo=${encodeURIComponent(pathname + context.url.search)}`);
	}

	const response = await next();

	response.headers.set("x-robots-tag", "noindex");

	return response;
}
