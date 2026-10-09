import { describe, expect, test } from "bun:test";
import { generateKeyPairSync, verify } from "node:crypto";

import {
	GitHubApiError,
	createAppTokenProvider,
	createGitHubClient,
	createStaticTokenProvider,
} from "#/src/lib/cms/storage/github/client.ts";
import { getRejection } from "#/tests/helpers.ts";

describe("github client", () => {
	test("sends authenticated requests relative to the repository", async () => {
		const requests: Array<{ url: string; headers: Headers }> = [];
		const client = createGitHubClient({
			repository: "owner/repo",
			auth: createStaticTokenProvider("secret"),
			fetch(input, init) {
				requests.push({ url: input.href, headers: new Headers(init?.headers) });
				return Promise.resolve(Response.json({ ok: true }));
			},
		});

		expect(await client.request<{ ok: boolean }>({ path: "/git/trees/main" })).toEqual({ ok: true });
		expect(requests[0]!.url).toBe("https://api.github.com/repos/owner/repo/git/trees/main");
		expect(requests[0]!.headers.get("authorization")).toBe("Bearer secret");
		expect(requests[0]!.headers.get("x-github-api-version")).toBe("2022-11-28");
	});

	test("keeps the path of the base url, e.g. for github enterprise server", async () => {
		const urls: Array<string> = [];
		const client = createGitHubClient({
			baseUrl: "https://github.example.org/api/v3/",
			repository: "owner/repo",
			auth: createStaticTokenProvider("secret"),
			fetch(input) {
				urls.push(input.href);
				return Promise.resolve(Response.json({}));
			},
		});

		await client.request<unknown>({ path: "/git/trees/main" });

		expect(urls).toEqual(["https://github.example.org/api/v3/repos/owner/repo/git/trees/main"]);
	});

	test("resolves 404s with undefined, and throws on other errors", async () => {
		const client = createGitHubClient({
			repository: "owner/repo",
			auth: createStaticTokenProvider("secret"),
			fetch(input) {
				const status = input.pathname.endsWith("/missing") ? 404 : 403;
				return Promise.resolve(Response.json({ message: "API rate limit exceeded" }, { status }));
			},
		});

		expect(await client.request<unknown>({ path: "/missing" })).toBeUndefined();

		const error = await getRejection(client.request<unknown>({ path: "/forbidden" }));

		expect(GitHubApiError.is(error) && error.status).toBe(403);
	});

	test("rejects invalid repository names", () => {
		expect(() => createGitHubClient({ repository: "owner", auth: createStaticTokenProvider("secret") })).toThrow(
			/owner\/repo/,
		);
	});
});

describe("github app token provider", () => {
	const { privateKey, publicKey } = generateKeyPairSync("rsa", {
		modulusLength: 2048,
		privateKeyEncoding: { type: "pkcs1", format: "pem" },
		publicKeyEncoding: { type: "spki", format: "pem" },
	});

	test("exchanges a signed jwt for an installation token, and renews it before it expires", async () => {
		let now = Date.parse("2026-10-09T12:00:00Z");
		const jwts: Array<string> = [];
		let issued = 0;

		const provider = createAppTokenProvider({
			appId: "123",
			installationId: "456",
			privateKey,
			now: () => now,
			fetch(input, init) {
				expect(input.href).toBe("https://api.github.com/app/installations/456/access_tokens");
				jwts.push(new Headers(init?.headers).get("authorization")!.replace(/^Bearer /, ""));
				issued++;
				return Promise.resolve(
					Response.json({ token: `token-${String(issued)}`, expires_at: new Date(now + 60 * 60 * 1000).toISOString() }),
				);
			},
		});

		const [first, concurrent] = await Promise.all([provider.getToken(), provider.getToken()]);

		expect(first).toBe("token-1");
		expect(concurrent).toBe("token-1");
		expect(await provider.getToken()).toBe("token-1");

		now += 56 * 60 * 1000;

		expect(await provider.getToken()).toBe("token-2");

		const [header, payload, signature] = jwts[0]!.split(".") as [string, string, string];

		expect(
			verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url")),
		).toBe(true);
		expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toMatchObject({ iss: "123" });
	});
});
