import { defineMiddleware } from "astro:middleware";

function isPathWithin(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Baseline headers, which restrict nothing the site does. The content security policy only covers framing, form targets
 * and similar, not scripts - which would need hashes of astro's inline scripts, see the `security.csp` option, and
 * allowances for e.g. matomo and uploads to s3. Not worth maintaining while only trusted editors write content, and
 * rendering escapes it - reconsider when the site renders content from visitors, or embeds third-party scripts. Strict
 * transport security is ignored by browsers over plain http, e.g. in development.
 */
const securityHeaders = {
	"content-security-policy": "base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'",
	"referrer-policy": "strict-origin-when-cross-origin",
	"strict-transport-security": "max-age=31536000",
	"x-content-type-options": "nosniff",
};

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

	for (const [name, value] of Object.entries(securityHeaders)) {
		response.headers.set(name, value);
	}

	return response;
});
