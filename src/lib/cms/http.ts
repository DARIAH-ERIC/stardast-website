import type { APIRoute } from "astro";

import { RateLimitError } from "#/src/lib/cms/storage/github/client.ts";

/** Responds with a 503 when github is rate limiting, so that the editor can say when to try again. */
export function handleRateLimits(route: APIRoute, now: () => number = Date.now): APIRoute {
	return async (context) => {
		try {
			return await route(context);
		} catch (error) {
			if (!RateLimitError.is(error)) {
				throw error;
			}

			const retryAfter = Math.max(1, Math.ceil((error.retryAt.getTime() - now()) / 1000));

			return Response.json(
				{ message: "GitHub is limiting requests right now.", retryAt: error.retryAt.toISOString() },
				{ status: 503, headers: { "retry-after": String(retryAfter) } },
			);
		}
	};
}
