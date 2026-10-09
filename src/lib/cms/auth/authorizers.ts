import type { Authorizer } from "#/src/lib/cms/auth/types.ts";
import type { GitHubClient } from "#/src/lib/cms/storage/github/client.ts";

/** Grants access to the listed logins, compared case-insensitively. */
export function createAllowlistAuthorizer(logins: ReadonlyArray<string>): Authorizer {
	const allowed = new Set(logins.map((login) => login.toLowerCase()));

	return {
		authorize(identity) {
			return Promise.resolve(allowed.has(identity.login.toLowerCase()) ? "editor" : null);
		},
	};
}

/** Grants access to everyone who signs in - only for the development auth provider. */
export function createAllowAllAuthorizer(): Authorizer {
	return {
		authorize() {
			return Promise.resolve("editor");
		},
	};
}

/**
 * Grants access to github users who can push to the content repository - so access is managed where the content lives.
 * Checked with the server's token, at sign-in only: revoked access takes effect when the session expires.
 *
 * @see {@link https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user}
 */
export function createGitHubRepositoryAuthorizer(client: GitHubClient): Authorizer {
	return {
		async authorize(identity) {
			if (identity.provider !== "github") {
				return null;
			}

			const response = await client.request<{ permission: "admin" | "none" | "read" | "write" }>({
				path: `/collaborators/${encodeURIComponent(identity.login)}/permission`,
			});

			/** `maintain` is reported as `write`, and `triage` as `read`. */
			return response?.permission === "admin" || response?.permission === "write" ? "editor" : null;
		},
	};
}
