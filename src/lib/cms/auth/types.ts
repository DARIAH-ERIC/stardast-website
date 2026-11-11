/** Who signed in. Used as commit author, so `name` and `email` must always be set. */
export interface Identity {
	provider: string;
	/** Stable id at the provider - unlike e.g. a github login, which can be renamed. */
	id: string;
	login: string;
	name: string;
	email: string;
	avatarUrl?: string;
}

/** Contributors save and discard drafts, and upload media. Editors also publish, and delete published entries. */
export type Role = "contributor" | "editor";

/**
 * Signs users in via a redirect flow, e.g. oauth: the user is redirected to `createAuthorizationUrl()`, and returns to
 * `redirectUri`, where `handleCallback()` exchanges the callback parameters for the user's identity.
 */
export interface AuthProvider {
	readonly id: string;
	/** Shown on the sign-in button, e.g. "GitHub". */
	readonly label: string;
	createAuthorizationUrl: (params: { state: string; codeVerifier: string; redirectUri: string }) => Promise<URL>;
	handleCallback: (params: { url: URL; codeVerifier: string; redirectUri: string }) => Promise<Identity>;
}

/**
 * Decides what a signed-in user may do, separately from how they signed in. `null` denies access. Asked on every
 * request, not only at sign-in, so that a changed role - or revoked access - takes effect without signing out.
 */
export interface Authorizer {
	authorize: (identity: Identity) => Promise<Role | null>;
}
