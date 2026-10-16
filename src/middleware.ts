import { defineMiddleware } from "astro:middleware";

function isPathWithin(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * The cms is loaded on demand, rather than imported: importing it validates its configuration, which would make every
 * route fail when the configuration is broken - including the liveness check, which must only reflect whether the
 * process can respond. Health checks therefore skip the cms entirely, see `/api/health/`.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	if (isPathWithin(context.url.pathname, "/api/health")) {
		return next();
	}

	const { handleRequest } = await import("#/src/cms/middleware.ts");

	const response = await handleRequest(context, next);

	/**
	 * Until the site is public, see `robots.txt`. Read directly rather than via `configs/env.config.ts`, which validates
	 * the whole environment on import - the value is inlined at build time, and validated by `astro.config.ts` then.
	 */
	if (import.meta.env.PUBLIC_APP_BOTS !== "enabled") {
		response.headers.set("x-robots-tag", "noindex");
	}

	return response;
});
