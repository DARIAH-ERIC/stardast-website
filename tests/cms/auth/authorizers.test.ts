import { describe, expect, test } from "bun:test";

import {
	createAllowlistAuthorizer,
	createCachedAuthorizer,
	createGitHubRepositoryAuthorizer,
} from "#/src/lib/cms/auth/authorizers.ts";
import type { Authorizer, Identity, Role } from "#/src/lib/cms/auth/types.ts";
import { createGitHubClient, createStaticTokenProvider } from "#/src/lib/cms/storage/github/client.ts";
import { getRejection } from "#/tests/helpers.ts";

function createIdentity(login: string, provider = "github"): Identity {
	return { provider, id: login, login, name: login, email: `${login}@example.org` };
}

describe("allowlist authorizer", () => {
	test("grants listed users their role, ignoring case, and editors win", async () => {
		const authorizer = createAllowlistAuthorizer({ editors: ["Jane", "both"], contributors: ["john", "Both"] });

		expect(await authorizer.authorize(createIdentity("jane"))).toBe("editor");
		expect(await authorizer.authorize(createIdentity("JOHN"))).toBe("contributor");
		expect(await authorizer.authorize(createIdentity("both"))).toBe("editor");
		expect(await authorizer.authorize(createIdentity("someone"))).toBeNull();
	});

	test("works with only contributors", async () => {
		const authorizer = createAllowlistAuthorizer({ contributors: ["john"] });

		expect(await authorizer.authorize(createIdentity("john"))).toBe("contributor");
		expect(await authorizer.authorize(createIdentity("jane"))).toBeNull();
	});
});

describe("github repository authorizer", () => {
	/** As reported by github: `maintain` only by `role_name`, custom roles by name and base permission. */
	const permissions: Record<string, { permission: string; role_name: string }> = {
		owner: { permission: "admin", role_name: "admin" },
		maintainer: { permission: "write", role_name: "maintain" },
		writer: { permission: "write", role_name: "write" },
		custom: { permission: "write", role_name: "content-writer" },
		triager: { permission: "read", role_name: "triage" },
		reader: { permission: "read", role_name: "read" },
	};

	const authorizer = createGitHubRepositoryAuthorizer(
		createGitHubClient({
			repository: "owner/repo",
			auth: createStaticTokenProvider("token"),
			fetch(url) {
				const login = /\/collaborators\/(?<login>[^/]+)\/permission$/.exec(url.pathname)?.groups?.login ?? "";
				const body = permissions[login];

				return Promise.resolve(
					body != null ? Response.json(body) : Response.json({ message: "Not Found" }, { status: 404 }),
				);
			},
		}),
	);

	test("maps repository roles", async () => {
		const roles: Record<string, Role | null> = {};

		for (const login of [...Object.keys(permissions), "stranger"]) {
			// oxlint-disable-next-line no-await-in-loop
			roles[login] = await authorizer.authorize(createIdentity(login));
		}

		expect(roles).toEqual({
			owner: "editor",
			maintainer: "editor",
			writer: "contributor",
			custom: "contributor",
			triager: null,
			reader: null,
			stranger: null,
		});
	});

	test("denies identities from other providers", async () => {
		expect(await authorizer.authorize(createIdentity("owner", "development"))).toBeNull();
	});
});

function setupCache() {
	let time = 0;
	let role: Role | null = "editor";
	let fail = false;
	let calls = 0;

	const inner: Authorizer = {
		authorize() {
			calls += 1;
			return fail ? Promise.reject(new Error("GitHub is down.")) : Promise.resolve(role);
		},
	};

	return {
		authorizer: createCachedAuthorizer(inner, { ttl: 1000, now: () => time }),
		advance: (ms: number) => {
			time += ms;
		},
		setRole: (value: Role | null) => {
			role = value;
		},
		setFail: (value: boolean) => {
			fail = value;
		},
		calls: () => calls,
	};
}

describe("cached authorizer", () => {
	test("reuses decisions for the ttl, per user", async () => {
		const { authorizer, advance, setRole, calls } = setupCache();

		expect(await authorizer.authorize(createIdentity("jane"))).toBe("editor");
		setRole("contributor");
		expect(await authorizer.authorize(createIdentity("jane"))).toBe("editor");
		expect(calls()).toBe(1);

		expect(await authorizer.authorize(createIdentity("john"))).toBe("contributor");
		expect(calls()).toBe(2);

		advance(1001);
		setRole(null);
		expect(await authorizer.authorize(createIdentity("jane"))).toBeNull();
	});

	test("does not cache failures", async () => {
		const { authorizer, setFail, calls } = setupCache();

		setFail(true);
		expect(String(await getRejection(authorizer.authorize(createIdentity("jane"))))).toContain("GitHub is down.");

		setFail(false);
		expect(await authorizer.authorize(createIdentity("jane"))).toBe("editor");
		expect(calls()).toBe(2);
	});
});
