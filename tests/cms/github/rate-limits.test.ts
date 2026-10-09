import { describe, expect, test } from "bun:test";

import { handleRateLimits } from "#/src/lib/cms/http.ts";
import {
	type Fetch,
	GitHubApiError,
	RateLimitError,
	type RateLimitStatus,
	createGitHubClient,
	createStaticTokenProvider,
} from "#/src/lib/cms/storage/github/client.ts";
import { createGitHubStorage } from "#/src/lib/cms/storage/github/storage.ts";
import { createFakeGitHub } from "#/tests/cms/github/fake-github.ts";
import { getRejection } from "#/tests/helpers.ts";

const now = Date.parse("2026-10-09T12:00:00Z");

function setup(responses: Array<() => Response>) {
	const sleeps: Array<number> = [];
	const warnings: Array<RateLimitStatus> = [];
	let calls = 0;

	const fetch: Fetch = () => {
		const response = responses[Math.min(calls, responses.length - 1)]!();
		calls++;
		return Promise.resolve(response);
	};

	const client = createGitHubClient({
		repository: "owner/repo",
		auth: createStaticTokenProvider("token"),
		fetch,
		now: () => now,
		sleep(milliseconds) {
			sleeps.push(milliseconds);
			return Promise.resolve();
		},
		onRateLimitWarning(status) {
			warnings.push(status);
		},
	});

	return { client, sleeps, warnings, getCalls: () => calls };
}

function rateLimitHeaders(remaining: number, resetInSeconds: number, limit = 5000) {
	return {
		"x-ratelimit-limit": String(limit),
		"x-ratelimit-remaining": String(remaining),
		"x-ratelimit-reset": String(now / 1000 + resetInSeconds),
	};
}

describe("rate limits", () => {
	test("retries once when github asks to wait briefly", async () => {
		const { client, sleeps, getCalls } = setup([
			() => Response.json({ message: "secondary rate limit" }, { status: 429, headers: { "retry-after": "2" } }),
			() => Response.json({ ok: true }),
		]);

		expect(await client.request<{ ok: boolean }>({ path: "/x" })).toEqual({ ok: true });
		expect(sleeps).toEqual([2000]);
		expect(getCalls()).toBe(2);
	});

	test("fails with the time to retry at, when the wait is long", async () => {
		const { client, sleeps } = setup([
			() => Response.json({ message: "API rate limit exceeded" }, { status: 403, headers: rateLimitHeaders(0, 600) }),
		]);

		const error = await getRejection(client.request<unknown>({ path: "/x" }));

		expect(RateLimitError.is(error) && error.retryAt.toISOString()).toBe("2026-10-09T12:10:00.000Z");
		expect(sleeps).toEqual([]);
	});

	test("fails after one retry", async () => {
		const { client, getCalls } = setup([
			() => Response.json({ message: "secondary rate limit" }, { status: 429, headers: { "retry-after": "1" } }),
		]);

		expect(RateLimitError.is(await getRejection(client.request<unknown>({ path: "/x" })))).toBe(true);
		expect(getCalls()).toBe(2);
	});

	test("waits a minute for secondary rate limits without retry-after", async () => {
		const { client } = setup([
			() => Response.json({ message: "You have exceeded a secondary rate limit." }, { status: 403 }),
		]);

		const error = await getRejection(client.request<unknown>({ path: "/x" }));

		expect(RateLimitError.is(error) && error.retryAt.getTime() - now).toBe(60_000);
	});

	test("does not mistake missing permissions for rate limits", async () => {
		const { client } = setup([
			() => Response.json({ message: "Resource not accessible by integration" }, { status: 403 }),
		]);

		expect(GitHubApiError.is(await getRejection(client.request<unknown>({ path: "/x" })))).toBe(true);
	});

	test("warns once per window when less than 10% remain", async () => {
		const { client, warnings } = setup([
			() => Response.json({}, { headers: rateLimitHeaders(600, 600) }),
			() => Response.json({}, { headers: rateLimitHeaders(499, 600) }),
			() => Response.json({}, { headers: rateLimitHeaders(498, 600) }),
		]);

		for (let index = 0; index < 3; index++) {
			// oxlint-disable-next-line no-await-in-loop
			await client.request<unknown>({ path: "/x" });
		}

		expect(warnings).toEqual([{ limit: 5000, remaining: 499, resetAt: new Date(now + 600_000) }]);
	});

	test("responds with 503 and retry-after", async () => {
		const route = handleRateLimits(
			() => {
				throw new RateLimitError({ message: "", method: "GET", path: "/x", retryAt: new Date(now + 90_500) });
			},
			() => now,
		);

		const response = await route({} as Parameters<typeof route>[0]);

		expect(response.status).toBe(503);
		expect(response.headers.get("retry-after")).toBe("91");
		expect(await response.json()).toEqual({
			message: "GitHub is limiting requests right now.",
			retryAt: "2026-10-09T12:01:30.500Z",
		});
	});
});

describe("conditional ref checks", () => {
	test("re-checks an unchanged ref with its etag, which github answers with a free 304", async () => {
		let time = 0;
		const github = createFakeGitHub({ files: { "content/news/a/index.json": "{}" } });
		const client = createGitHubClient({
			repository: "owner/repo",
			auth: createStaticTokenProvider("token"),
			fetch: github.fetch,
		});
		const storage = createGitHubStorage({ client, refTtl: 1000, now: () => time });

		const first = await storage.resolve("main");
		time += 1001;
		const second = await storage.resolve("main");

		expect(second).toBe(first);
		expect(github.statuses).toEqual([200, 304]);

		const pushed = github.push("main", { "content/news/b/index.json": "{}" });
		time += 1001;

		expect(await storage.resolve("main")).toBe(pushed);
		expect(github.statuses).toEqual([200, 304, 200]);
	});
});
