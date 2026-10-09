import { expect, test } from "bun:test";

import { createGitHubAuthProvider } from "#/src/lib/cms/auth/providers/github.ts";

test("builds the authorization url with state and a pkce challenge", async () => {
	const provider = createGitHubAuthProvider({ clientId: "client", clientSecret: "secret" });

	const url = await provider.createAuthorizationUrl({
		state: "state",
		codeVerifier: "verifier",
		redirectUri: "https://example.org/api/cms/auth/callback",
	});

	expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
	expect(Object.fromEntries(url.searchParams)).toMatchObject({
		client_id: "client",
		state: "state",
		redirect_uri: "https://example.org/api/cms/auth/callback",
		code_challenge_method: "S256",
		/** Base64url-encoded sha-256 of "verifier". */
		code_challenge: "iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ",
	});
});

test("exchanges the code, and falls back to the noreply address for private emails", async () => {
	const requests: Array<string> = [];

	const provider = createGitHubAuthProvider({
		clientId: "client",
		clientSecret: "secret",
		fetch(url, init) {
			requests.push(`${init?.method ?? "GET"} ${url.href}`);

			switch (url.pathname) {
				case "/login/oauth/access_token": {
					expect(JSON.parse(init!.body as string)).toMatchObject({ code: "code", code_verifier: "verifier" });
					return Promise.resolve(Response.json({ access_token: "user-token" }));
				}
				case "/user": {
					return Promise.resolve(Response.json({ id: 42, login: "jane", name: null, email: null, avatar_url: "a" }));
				}
				default: {
					return Promise.resolve(Response.json([{ email: "jane@example.org", primary: true, verified: false }]));
				}
			}
		},
	});

	const identity = await provider.handleCallback({
		url: new URL("https://example.org/callback?code=code&state=state"),
		codeVerifier: "verifier",
		redirectUri: "https://example.org/callback",
	});

	expect(identity).toEqual({
		provider: "github",
		id: "42",
		login: "jane",
		name: "jane",
		email: "42+jane@users.noreply.github.com",
		avatarUrl: "a",
	});
	expect(requests).toEqual([
		"POST https://github.com/login/oauth/access_token",
		"GET https://api.github.com/user",
		"GET https://api.github.com/user/emails",
	]);
});

test("reports failed exchanges, which github sends with status 200", async () => {
	const provider = createGitHubAuthProvider({
		clientId: "client",
		clientSecret: "secret",
		fetch() {
			return Promise.resolve(Response.json({ error: "bad_verification_code" }));
		},
	});

	const error = await provider
		.handleCallback({ url: new URL("https://example.org/?code=x"), codeVerifier: "v", redirectUri: "r" })
		.catch((error: unknown) => error);

	expect((error as Error).message).toMatch(/bad_verification_code/);
});
