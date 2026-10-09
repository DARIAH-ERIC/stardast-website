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

	return handleRequest(context, next);
});
