import type { AuthProvider, Identity } from "#/src/lib/cms/auth/types.ts";
import type { Fetch } from "#/src/lib/cms/storage/github/client.ts";

interface GitHubUser {
	id: number;
	login: string;
	name: string | null;
	email: string | null;
	avatar_url: string;
}

interface GitHubEmail {
	email: string;
	primary: boolean;
	verified: boolean;
}

async function createCodeChallenge(codeVerifier: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));

	return Buffer.from(digest).toString("base64url");
}

/**
 * Signs in with a github oauth app, or with the user authorization of a github app. Only reads the user's profile -
 * and, with `commitEmail: "primary"`, their primary email - for commit attribution. The user's token is not kept.
 *
 * @see {@link https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps}
 */
export function createGitHubAuthProvider(params: {
	clientId: string;
	clientSecret: string;
	/** Github enterprise server, e.g. `https://github.example.org`. */
	baseUrl?: string;
	apiUrl?: string;
	/**
	 * The email address commits are attributed with. Commits are public in a public repository, so by default with the
	 * user's github noreply address. `primary` uses their primary email address instead - unless it is private, or not
	 * verified - and needs the `user:email` scope, or a github app's "email addresses" account permission.
	 */
	commitEmail?: "noreply" | "primary";
	fetch?: Fetch;
}): AuthProvider {
	const {
		clientId,
		clientSecret,
		baseUrl = "https://github.com",
		apiUrl = "https://api.github.com",
		commitEmail = "noreply",
		fetch = globalThis.fetch,
	} = params;

	async function api<T>(path: string, token: string): Promise<T> {
		const response = await fetch(new URL(`${apiUrl.replace(/\/+$/, "")}${path}`), {
			headers: {
				accept: "application/vnd.github+json",
				authorization: `Bearer ${token}`,
				"x-github-api-version": "2022-11-28",
			},
		});

		if (!response.ok) {
			throw new Error(`GitHub api request ${path} failed with status ${String(response.status)}.`);
		}

		return (await response.json()) as T;
	}

	return {
		id: "github",
		label: "GitHub",

		async createAuthorizationUrl({ state, codeVerifier, redirectUri }) {
			const url = new URL(`${baseUrl.replace(/\/+$/, "")}/login/oauth/authorize`);
			url.searchParams.set("client_id", clientId);
			url.searchParams.set("redirect_uri", redirectUri);
			url.searchParams.set("state", state);
			if (commitEmail === "primary") {
				/** Ignored for github apps, which ask for the "email addresses" account permission instead. */
				url.searchParams.set("scope", "user:email");
			}
			url.searchParams.set("code_challenge", await createCodeChallenge(codeVerifier));
			url.searchParams.set("code_challenge_method", "S256");
			url.searchParams.set("allow_signup", "false");

			return url;
		},

		async handleCallback({ url, codeVerifier, redirectUri }): Promise<Identity> {
			const code = url.searchParams.get("code");

			if (code == null) {
				throw new Error(`Sign-in was not completed: ${url.searchParams.get("error") ?? "missing code"}.`);
			}

			const response = await fetch(new URL(`${baseUrl.replace(/\/+$/, "")}/login/oauth/access_token`), {
				method: "POST",
				headers: { accept: "application/json", "content-type": "application/json" },
				body: JSON.stringify({
					client_id: clientId,
					client_secret: clientSecret,
					code,
					redirect_uri: redirectUri,
					code_verifier: codeVerifier,
				}),
			});

			/** Errors are reported with status 200, and an `error` field. */
			const body = (await response.json()) as { access_token?: string; error?: string };

			if (!response.ok || body.access_token == null) {
				throw new Error(`Failed to exchange the authorization code: ${body.error ?? String(response.status)}.`);
			}

			const token = body.access_token;
			const user = await api<GitHubUser>("/user", token);

			let email: string | null = null;

			if (commitEmail === "primary") {
				email = user.email;

				if (email == null) {
					const emails = await api<Array<GitHubEmail>>("/user/emails", token).catch(() => []);
					email = emails.find((item) => item.primary && item.verified)?.email ?? null;
				}
			}

			return {
				provider: "github",
				id: String(user.id),
				login: user.login,
				name: user.name ?? user.login,
				email: email ?? `${String(user.id)}+${user.login}@users.noreply.github.com`,
				avatarUrl: user.avatar_url,
			};
		},
	};
}
