import type { APIRoute } from "astro";

let hasLoggedError = false;

/**
 * Readiness: whether this server is configured correctly, i.e. whether the cms - its environment variables, storage,
 * and asset storage - can be loaded. A misconfigured new version therefore never receives traffic, while the previous
 * one keeps serving.
 *
 * Deliberately does not check whether github is reachable: with a single replica, an outage would take the whole site
 * offline, although cached pages can still be served. The admin ui's sign-in configuration is not checked either, so
 * that it cannot take the public site down.
 */
export const GET: APIRoute = async (context) => {
	const headers = { "cache-control": "no-store" };

	try {
		await import("#/src/cms/server.ts");
		await import("#/src/cms/media.ts");

		return Response.json({ status: "ready" }, { headers });
	} catch (error) {
		/** Logged, but not returned: validation messages may include configured values. */
		if (!hasLoggedError) {
			hasLoggedError = true;
			context.logger.error(`Not ready: ${String(error)}`);
		}

		return Response.json({ status: "not ready" }, { status: 503, headers });
	}
};
