import type { APIContext, AstroCookieSetOptions } from "astro";
import * as v from "valibot";

import { env } from "#/configs/env.config.ts";
import { githubClient } from "#/src/cms/server.ts";
import {
	createAllowAllAuthorizer,
	createAllowlistAuthorizer,
	createCachedAuthorizer,
	createGitHubRepositoryAuthorizer,
} from "#/src/lib/cms/auth/authorizers.ts";
import { createDevelopmentAuthProvider } from "#/src/lib/cms/auth/providers/development.ts";
import { createGitHubAuthProvider } from "#/src/lib/cms/auth/providers/github.ts";
import { type SealedCodec, createRandomToken, createSealedCodec } from "#/src/lib/cms/auth/sealed.ts";
import type { AuthProvider, Authorizer, Role } from "#/src/lib/cms/auth/types.ts";
import { type UploadToken, UploadTokenSchema } from "#/src/lib/cms/media/service.ts";

const IdentitySchema = v.object({
	provider: v.string(),
	id: v.string(),
	login: v.string(),
	name: v.string(),
	email: v.string(),
	avatarUrl: v.optional(v.string()),
});

/**
 * Only who signed in - what they may do is decided on every request, see `Authorizer`. Cookies from before roles also
 * hold a `role`, which is ignored.
 */
const SessionCookieSchema = v.object({ identity: IdentitySchema });

type SessionCookie = v.InferOutput<typeof SessionCookieSchema>;

export interface Session extends SessionCookie {
	role: Role;
}

/** Publishing - and deleting published entries - changes the website, which contributors may not. */
export function canPublish(session: Session | undefined): boolean {
	return session?.role === "editor";
}

const OAuthStateSchema = v.object({ state: v.string(), codeVerifier: v.string(), returnTo: v.string() });

export type OAuthState = v.InferOutput<typeof OAuthStateSchema>;

/** Sessions are not renewed: users sign in again after a working day. */
const sessionMaxAge = 12 * 60 * 60;
const oauthStateMaxAge = 10 * 60;

const sessionCookie = "cms_session";
const oauthStateCookie = "cms_oauth_state";

export const callbackPath = "/api/cms/auth/callback";

interface Auth {
	provider: AuthProvider;
	authorizer: Authorizer;
	sessions: SealedCodec<SessionCookie>;
	oauthStates: SealedCodec<OAuthState>;
	/** For uploads through the server, see `MediaService`. */
	uploadTokens: SealedCodec<UploadToken>;
}

function createAuth(): Auth {
	const mode = env.CMS_AUTH ?? (import.meta.env.DEV ? "development" : "github");

	if (mode === "development" && !import.meta.env.DEV) {
		throw new Error('CMS_AUTH="development" signs in anyone, and is therefore only available in `astro dev`.');
	}

	/**
	 * Development sign-in lets anyone in anyway, so a fixed secret costs nothing - and keeps sessions across dev server
	 * restarts. Otherwise, in development, a random secret only means signing in again after a restart.
	 */
	const secret =
		env.CMS_SESSION_SECRET ??
		(mode === "development" ? "development-only-session-secret-not-for-production" : undefined) ??
		(import.meta.env.DEV ? createRandomToken() : undefined);

	if (secret == null) {
		throw new Error("The admin ui requires CMS_SESSION_SECRET.");
	}

	const sessions = createSealedCodec({ secret, purpose: "session", schema: SessionCookieSchema });
	const oauthStates = createSealedCodec({ secret, purpose: "oauth-state", schema: OAuthStateSchema });
	const uploadTokens = createSealedCodec({ secret, purpose: "upload", schema: UploadTokenSchema });

	if (mode === "development") {
		return {
			provider: createDevelopmentAuthProvider(),
			authorizer: createAllowAllAuthorizer(),
			sessions,
			oauthStates,
			uploadTokens,
		};
	}

	if (env.CMS_GITHUB_OAUTH_CLIENT_ID == null || env.CMS_GITHUB_OAUTH_CLIENT_SECRET == null) {
		throw new Error("Signing in with GitHub requires CMS_GITHUB_OAUTH_CLIENT_ID and CMS_GITHUB_OAUTH_CLIENT_SECRET.");
	}

	const provider = createGitHubAuthProvider({
		clientId: env.CMS_GITHUB_OAUTH_CLIENT_ID,
		clientSecret: env.CMS_GITHUB_OAUTH_CLIENT_SECRET,
	});

	let authorizer: Authorizer;

	if (env.CMS_ADMIN_USERS != null || env.CMS_CONTRIBUTOR_USERS != null) {
		authorizer = createAllowlistAuthorizer({ editors: env.CMS_ADMIN_USERS, contributors: env.CMS_CONTRIBUTOR_USERS });
	} else if (githubClient != null) {
		/** Asked on every request, so cached - a changed role on github takes effect within minutes. */
		authorizer = createCachedAuthorizer(createGitHubRepositoryAuthorizer(githubClient), { ttl: 5 * 60 * 1000 });
	} else {
		throw new Error(
			"Signing in with GitHub requires either CMS_ADMIN_USERS or CMS_CONTRIBUTOR_USERS, or `github` storage.",
		);
	}

	return { provider, authorizer, sessions, oauthStates, uploadTokens };
}

let auth: Auth | undefined;

/** Created on first use, so that a misconfigured admin ui does not take down the public site. */
export function getAuth(): Auth {
	auth ??= createAuth();

	return auth;
}

/** Secure if the site is served over https - not the request url, which depends on the proxy's forwarded headers. */
function getCookieOptions(context: Pick<APIContext, "site">, maxAge: number, path = "/"): AstroCookieSetOptions {
	return { httpOnly: true, maxAge, path, sameSite: "lax", secure: context.site?.protocol === "https:" };
}

/** The signed-in user, with their current role. Signs out users who have lost access since they signed in. */
export async function getSession(context: Pick<APIContext, "cookies" | "site">): Promise<Session | undefined> {
	const value = context.cookies.get(sessionCookie)?.value;
	const { sessions, authorizer } = getAuth();
	const cookie = value != null ? await sessions.unseal(value) : undefined;

	if (cookie == null) {
		return undefined;
	}

	const role = await authorizer.authorize(cookie.identity);

	if (role == null) {
		clearSession(context);

		return undefined;
	}

	return { ...cookie, role };
}

export async function setSession(context: Pick<APIContext, "cookies" | "site">, session: SessionCookie): Promise<void> {
	const value = await getAuth().sessions.seal(session, { maxAge: sessionMaxAge });

	context.cookies.set(sessionCookie, value, getCookieOptions(context, sessionMaxAge));
}

export function clearSession(context: Pick<APIContext, "cookies" | "site">): void {
	context.cookies.delete(sessionCookie, getCookieOptions(context, 0));
}

/** Scoped to the auth routes, which are the only ones that need it. */
const oauthStatePath = "/api/cms/auth";

export async function setOAuthState(context: Pick<APIContext, "cookies" | "site">, state: OAuthState): Promise<void> {
	const value = await getAuth().oauthStates.seal(state, { maxAge: oauthStateMaxAge });

	context.cookies.set(oauthStateCookie, value, getCookieOptions(context, oauthStateMaxAge, oauthStatePath));
}

/** Reads and removes the state, which is only valid for one callback. */
export async function takeOAuthState(context: Pick<APIContext, "cookies" | "site">): Promise<OAuthState | undefined> {
	const value = context.cookies.get(oauthStateCookie)?.value;

	context.cookies.delete(oauthStateCookie, getCookieOptions(context, 0, oauthStatePath));

	return value != null ? getAuth().oauthStates.unseal(value) : undefined;
}

export { getSafeReturnTo } from "#/src/lib/cms/auth/return-to.ts";
