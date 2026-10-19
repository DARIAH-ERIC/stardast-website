import type { Authorizer, Role } from "#/src/lib/cms/auth/types.ts";
import type { GitHubClient } from "#/src/lib/cms/storage/github/client.ts";

/** Grants the listed logins their role, compared case-insensitively. Editors win over contributors. */
export function createAllowlistAuthorizer(params: {
	editors?: ReadonlyArray<string>;
	contributors?: ReadonlyArray<string>;
}): Authorizer {
	const roles = new Map<string, Role>();

	for (const login of params.contributors ?? []) {
		roles.set(login.toLowerCase(), "contributor");
	}

	for (const login of params.editors ?? []) {
		roles.set(login.toLowerCase(), "editor");
	}

	return {
		authorize(identity) {
			return Promise.resolve(roles.get(identity.login.toLowerCase()) ?? null);
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
 * Grants access to github users by their role in the content repository - so access is managed where the content lives:
 * `admin` and `maintain` are editors, `write` contributors. Custom roles count by their base role, except for
 * `maintain`, which is only reported by name - custom roles based on it are contributors. Checked with the server's
 * token.
 *
 * @see {@link https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user}
 */
export function createGitHubRepositoryAuthorizer(client: GitHubClient): Authorizer {
	return {
		async authorize(identity) {
			if (identity.provider !== "github") {
				return null;
			}

			/** `permission` is the legacy base role, which reports `maintain` as `write`, and `triage` as `read`. */
			const response = await client.request<{ permission: "admin" | "none" | "read" | "write"; role_name: string }>({
				path: `/collaborators/${encodeURIComponent(identity.login)}/permission`,
			});

			if (response?.permission === "admin" || response?.role_name === "maintain") {
				return "editor";
			}

			return response?.permission === "write" ? "contributor" : null;
		},
	};
}

/**
 * Reuses an authorizer's decision for `ttl` milliseconds, e.g. to not ask github on every request. Changed roles take
 * effect after at most `ttl`. Failures are not cached.
 */
export function createCachedAuthorizer(
	authorizer: Authorizer,
	params: { ttl: number; now?: () => number },
): Authorizer {
	const { ttl, now = Date.now } = params;

	/** One entry per user with a session, so it stays small. */
	const decisions = new Map<string, { role: Promise<Role | null>; expiresAt: number }>();

	return {
		authorize(identity) {
			const key = `${identity.provider}:${identity.id}`;
			const cached = decisions.get(key);

			if (cached != null && cached.expiresAt > now()) {
				return cached.role;
			}

			const entry = { role: authorizer.authorize(identity), expiresAt: now() + ttl };

			decisions.set(key, entry);

			entry.role.catch(() => {
				if (decisions.get(key) === entry) {
					decisions.delete(key);
				}
			});

			return entry.role;
		},
	};
}
