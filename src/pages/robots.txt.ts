import type { APIRoute } from "astro";

import { env } from "#/configs/env.config.ts";

/**
 * Pages which must never be indexed, e.g. `/search` and `/admin`, are marked `noindex` instead of being disallowed
 * here: a disallowed page is never fetched, so its `noindex` is never seen - and a linked url could still be indexed,
 * without its content.
 */
export const GET: APIRoute = (context) => {
	const rules =
		env.PUBLIC_APP_BOTS === "enabled"
			? ["User-agent: *", "Disallow: /api/", "", `Sitemap: ${new URL("/sitemap.xml", context.site).href}`]
			: ["User-agent: *", "Disallow: /"];

	return new Response(`${rules.join("\n")}\n`, { headers: { "content-type": "text/plain; charset=utf-8" } });
};
