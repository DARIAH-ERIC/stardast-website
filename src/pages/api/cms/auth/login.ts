import type { APIRoute } from "astro";

import { callbackPath, getAuth, getSafeReturnTo, setOAuthState } from "#/src/cms/auth.ts";
import { createRandomToken } from "#/src/lib/cms/auth/sealed.ts";

/** Starts signing in: remembers state and pkce verifier in a short-lived cookie, and redirects to the provider. */
export const GET: APIRoute = async (context) => {
	const { provider } = getAuth();

	const state = createRandomToken();
	const codeVerifier = createRandomToken();
	const returnTo = getSafeReturnTo(context.url.searchParams.get("returnTo"));

	await setOAuthState(context, { state, codeVerifier, returnTo });

	const url = await provider.createAuthorizationUrl({
		state,
		codeVerifier,
		redirectUri: new URL(callbackPath, context.url).href,
	});

	return context.redirect(url.href);
};
