import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

import { collection, defineConfig, fields } from "#/src/lib/cms/schema/index.ts";
import { createGitHubClient, createStaticTokenProvider } from "#/src/lib/cms/storage/github/client.ts";
import { createGitHubStorage } from "#/src/lib/cms/storage/github/storage.ts";
import { handlePushEvent, parsePushEvent, verifySignature } from "#/src/lib/cms/webhooks/github.ts";
import { createFakeGitHub } from "#/tests/cms/github/fake-github.ts";

const config = defineConfig({
	collections: {
		news: collection({
			label: "News",
			path: "content/news",
			slug: { from: "title" },
			fields: { title: fields.text({ label: "Title" }) },
		}),
	},
});

describe("signature", () => {
	const secret = "a".repeat(32);
	const body = JSON.stringify({ ref: "refs/heads/main" });
	const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

	test("accepts a valid signature", async () => {
		expect(await verifySignature({ secret, body, signature })).toBe(true);
	});

	test("rejects a signature for another body, or another secret", async () => {
		expect(await verifySignature({ secret, body: `${body} `, signature })).toBe(false);
		expect(await verifySignature({ secret: "b".repeat(32), body, signature })).toBe(false);
	});

	test("rejects missing and malformed signatures", async () => {
		expect(await verifySignature({ secret, body, signature: null })).toBe(false);
		expect(await verifySignature({ secret, body, signature: "sha256=abc" })).toBe(false);
		expect(await verifySignature({ secret, body, signature: signature.replace("sha256=", "sha1=") })).toBe(false);
	});
});

function setup() {
	const github = createFakeGitHub({
		files: {
			"content/news/a/index.json": JSON.stringify({ title: "A" }),
			"content/news/b/index.json": JSON.stringify({ title: "B" }),
		},
	});
	const client = createGitHubClient({
		repository: "owner/repo",
		auth: createStaticTokenProvider("token"),
		fetch: github.fetch,
	});
	const storage = createGitHubStorage({ client });
	const invalidations: Array<{ tags: Array<string>; revision: string | undefined }> = [];

	async function invalidate(tags: Array<string>) {
		/** Records which revision a re-rendered page would read at the time of invalidation. */
		invalidations.push({ tags, revision: await storage.resolve("main") });
	}

	return { github, storage, invalidations, invalidate };
}

describe("push event", () => {
	test("records the new revision before invalidating the tags of changed entries", async () => {
		const { github, storage, invalidations, invalidate } = setup();
		const before = (await storage.resolve("main"))!;
		const after = github.push("main", { "content/news/b/index.json": JSON.stringify({ title: "B2" }) });

		const tags = await handlePushEvent({
			config,
			storage,
			event: { ref: "refs/heads/main", before, after },
			invalidate,
			repeatAfter: 0,
		});

		expect(tags).toEqual(["cms:collection:news", "cms:entry:news:b"]);
		expect(invalidations).toEqual([{ tags: tags!, revision: after }]);

		await Bun.sleep(1);

		expect(invalidations).toHaveLength(2);
	});

	test("does not invalidate anything for pushes which do not change content", async () => {
		const { github, storage, invalidations, invalidate } = setup();
		const before = (await storage.resolve("main"))!;
		const after = github.push("main", { "src/pages/index.astro": "code" });

		const tags = await handlePushEvent({
			config,
			storage,
			event: { ref: "refs/heads/main", before, after },
			invalidate,
		});

		expect(tags).toEqual([]);
		expect(invalidations).toEqual([]);
		expect(await storage.resolve("main")).toBe(after);
	});

	test("invalidates everything if the previous revision is unknown", async () => {
		const { github, invalidate, storage } = setup();
		const after = github.push("main", { "content/news/c/index.json": "{}" });

		expect(
			await handlePushEvent({
				config,
				storage,
				event: { ref: "refs/heads/main", before: "0".repeat(40), after },
				invalidate,
				repeatAfter: 0,
			}),
		).toEqual(["cms"]);

		expect(
			await handlePushEvent({
				config,
				storage,
				event: { ref: "refs/heads/main", before: "f".repeat(40), after },
				invalidate,
				repeatAfter: 0,
			}),
		).toEqual(["cms"]);
	});

	test("ignores pushes to other branches, and branch deletions", async () => {
		const { invalidate, storage } = setup();

		expect(
			await handlePushEvent({
				config,
				storage,
				event: { ref: "refs/heads/draft", before: "a".repeat(40), after: "b".repeat(40) },
				invalidate,
			}),
		).toBeUndefined();

		expect(
			await handlePushEvent({
				config,
				storage,
				event: { ref: "refs/heads/main", before: "a".repeat(40), after: "0".repeat(40) },
				invalidate,
			}),
		).toBeUndefined();
	});

	test("parses push payloads", () => {
		expect(parsePushEvent({ ref: "refs/heads/main", before: "a", after: "b", commits: [] })).toEqual({
			ref: "refs/heads/main",
			before: "a",
			after: "b",
		});
		expect(parsePushEvent({ zen: "Keep it logically awesome." })).toBeUndefined();
	});
});
