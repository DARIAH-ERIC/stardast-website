import type { AuthProvider, Identity } from "#/src/lib/cms/auth/types.ts";

/**
 * Signs in without any external service, as a fixed local user - so that the admin ui can be used without setting up an
 * oauth app. Only for development: must never be configured for a deployed server.
 */
export function createDevelopmentAuthProvider(identity?: Partial<Identity>): AuthProvider {
	return {
		id: "development",
		label: "local development user",

		createAuthorizationUrl({ state, redirectUri }) {
			const url = new URL(redirectUri);
			url.searchParams.set("code", "development");
			url.searchParams.set("state", state);

			return Promise.resolve(url);
		},

		handleCallback() {
			return Promise.resolve({
				provider: "development",
				id: "development",
				login: "developer",
				name: "Local Developer",
				email: "developer@localhost",
				...identity,
			});
		},
	};
}
