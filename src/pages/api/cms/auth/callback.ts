import type { APIRoute } from "astro";

import { callbackPath, getAuth, setSession, takeOAuthState } from "#/src/cms/auth.ts";

function fail(context: Parameters<APIRoute>[0], error: "denied" | "failed" | "forbidden"): Response {
	return context.redirect(`/admin/login?error=${error}`);
}

export const GET: APIRoute = async (context) => {
	const { provider, authorizer } = getAuth();

	const saved = await takeOAuthState(context);
	const state = context.url.searchParams.get("state");

	/** A missing or mismatched state means this callback was not started by this browser - e.g. a forged link. */
	if (saved == null || state == null || state !== saved.state) {
		return fail(context, "failed");
	}

	if (context.url.searchParams.get("error") === "access_denied") {
		return fail(context, "denied");
	}

	try {
		const identity = await provider.handleCallback({
			url: context.url,
			codeVerifier: saved.codeVerifier,
			redirectUri: new URL(callbackPath, context.url).href,
		});

		const role = await authorizer.authorize(identity);

		if (role == null) {
			return fail(context, "forbidden");
		}

		await setSession(context, { identity, role });

		return context.redirect(saved.returnTo);
	} catch (error) {
		context.logger.error(`Sign-in failed: ${String(error)}`);

		return fail(context, "failed");
	}
};
