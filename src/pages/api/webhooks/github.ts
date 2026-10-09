import type { APIRoute } from "astro";

import { env } from "#/configs/env.config.ts";
import { config } from "#/src/cms/config.ts";
import { refreshSearchIndex } from "#/src/cms/search.ts";
import { githubStorage } from "#/src/cms/server.ts";
import { handlePushEvent, parsePushEvent, verifySignature } from "#/src/lib/cms/webhooks/github.ts";

/**
 * Receives github push events - configure the repository webhook with content type `application/json`, and the
 * `REVALIDATION_WEBHOOK_SECRET` as secret - and invalidates the cached pages which read changed content.
 */
export const POST: APIRoute = async (context) => {
	const secret = env.REVALIDATION_WEBHOOK_SECRET;

	if (secret == null || githubStorage == null) {
		return new Response("Webhook is not configured.", { status: 404 });
	}

	const body = await context.request.text();
	const signature = context.request.headers.get("x-hub-signature-256");

	if (!(await verifySignature({ secret, body, signature }))) {
		return new Response("Invalid signature.", { status: 401 });
	}

	/** Includes `ping`, which github sends when the webhook is created. */
	if (context.request.headers.get("x-github-event") !== "push") {
		return new Response(null, { status: 204 });
	}

	const event = parsePushEvent(JSON.parse(body));

	if (event == null) {
		return new Response("Invalid push event.", { status: 400 });
	}

	const tags = await handlePushEvent({
		config,
		storage: githubStorage,
		event,
		async invalidate(tags) {
			/** Caching is disabled in development, where `invalidate()` would throw. */
			if (context.cache.enabled) {
				await context.cache.invalidate({ tags });
			}
		},
	});

	refreshSearchIndex();

	return Response.json({ invalidated: tags ?? [] });
};
