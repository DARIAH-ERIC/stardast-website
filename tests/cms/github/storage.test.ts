import { describe, expect, test } from "bun:test";

import { createGitHubClient, createStaticTokenProvider } from "#/src/lib/cms/storage/github/client.ts";
import { createGitHubStorage } from "#/src/lib/cms/storage/github/storage.ts";
import { ConflictError } from "#/src/lib/cms/storage/types.ts";
import { createFakeGitHub } from "#/tests/cms/github/fake-github.ts";
import { getRejection } from "#/tests/helpers.ts";

const author = { name: "Jane Doe", email: "jane@example.org" };

const committer = { name: "STARDAST CMS", email: "cms@example.org" };

function setup(params?: { now?: () => number }) {
	const github = createFakeGitHub({
		files: {
			"content/news/a/index.json": JSON.stringify({ title: "A" }),
			"content/news/a/image.jpg": "binary",
			"content/news/b/index.json": JSON.stringify({ title: "B" }),
			"content/news/readme.md": "not an entry",
			"src/pages/index.astro": "code",
		},
	});
	const client = createGitHubClient({
		repository: "owner/repo",
		auth: createStaticTokenProvider("token"),
		fetch: github.fetch,
	});
	const storage = createGitHubStorage({ client, committer, now: params?.now });

	return { github, storage };
}

function count(requests: Array<string>, prefix: string): number {
	return requests.filter((request) => request.startsWith(prefix)).length;
}

describe("github storage", () => {
	test("resolves refs, and reuses them for the ttl", async () => {
		let now = 0;
		const { github, storage } = setup({ now: () => now });

		expect(await storage.resolve("main")).toBe(github.ref("main"));
		expect(await storage.resolve("missing")).toBeUndefined();

		await storage.resolve("main");
		expect(count(github.requests, "GET /git/ref/heads/main")).toBe(1);

		const pushed = github.push("main", { "content/news/c/index.json": "{}" });
		now += 60_001;

		expect(await storage.resolve("main")).toBe(pushed);
		expect(count(github.requests, "GET /git/ref/heads/main")).toBe(2);
	});

	test("lists entry directories, and reads entries", async () => {
		const { storage } = setup();
		const revision = (await storage.resolve("main"))!;

		expect(await storage.list(revision, "content/news")).toEqual(["a", "b"]);
		expect(await storage.list(revision, "content/people")).toEqual([]);
		expect(await storage.read(revision, "content/news/a")).toEqual({ title: "A" });
		expect(await storage.read(revision, "content/news/missing")).toBeUndefined();
	});

	test("fetches a revision's tree once, and only blobs which changed", async () => {
		const { github, storage } = setup();
		const first = (await storage.resolve("main"))!;

		await Promise.all([storage.read(first, "content/news/a"), storage.read(first, "content/news/b")]);
		await storage.read(first, "content/news/a");
		await storage.list(first, "content/news");

		expect(count(github.requests, "GET /git/trees/")).toBe(1);
		expect(count(github.requests, "GET /git/blobs/")).toBe(2);

		const second = github.push("main", { "content/news/b/index.json": JSON.stringify({ title: "B2" }) });

		expect(await storage.read(second, "content/news/a")).toEqual({ title: "A" });
		expect(await storage.read(second, "content/news/b")).toEqual({ title: "B2" });
		expect(count(github.requests, "GET /git/trees/")).toBe(2);
		expect(count(github.requests, "GET /git/blobs/")).toBe(3);
	});

	test("commits changes atomically, with the editor as author", async () => {
		const { github, storage } = setup();
		const base = (await storage.resolve("main"))!;

		const result = await storage.commit({
			ref: "main",
			expectedRevision: base,
			changes: [
				{ type: "put", path: "content/news/c", data: { title: "C" } },
				{ type: "delete", path: "content/news/a" },
			],
			message: "Update news",
			author,
		});

		const revision = result.unwrap();

		expect(github.ref("main")).toBe(revision);
		expect(github.commit(revision)).toMatchObject({ parents: [base], message: "Update news", author, committer });
		expect(github.file("main", "content/news/c/index.json")).toBe('{\n\t"title": "C"\n}\n');
		expect(github.file("main", "content/news/a/index.json")).toBeUndefined();
		expect(github.file("main", "content/news/a/image.jpg")).toBeUndefined();
		expect(github.file("main", "src/pages/index.astro")).toBe("code");

		/** The new revision is known without asking github. */
		const refRequests = count(github.requests, "GET /git/ref/");
		expect(await storage.resolve("main")).toBe(revision);
		expect(count(github.requests, "GET /git/ref/")).toBe(refRequests);
	});

	test("a later change to the same entry wins", async () => {
		const { github, storage } = setup();
		const base = (await storage.resolve("main"))!;

		await storage.commit({
			ref: "main",
			expectedRevision: base,
			changes: [
				{ type: "delete", path: "content/news/a" },
				{ type: "put", path: "content/news/a", data: { title: "A2" } },
			],
			message: "Replace a",
			author,
		});

		expect(github.file("main", "content/news/a/index.json")).toBe('{\n\t"title": "A2"\n}\n');
		expect(github.file("main", "content/news/a/image.jpg")).toBeUndefined();
	});

	test("fails with a conflict if the ref has moved on", async () => {
		const { github, storage } = setup();
		const base = (await storage.resolve("main"))!;
		const pushed = github.push("main", { "content/news/b/index.json": JSON.stringify({ title: "B2" }) });

		const result = await storage.commit({
			ref: "main",
			expectedRevision: base,
			changes: [{ type: "put", path: "content/news/c", data: { title: "C" } }],
			message: "Add c",
			author,
		});

		expect(result.isErr() && ConflictError.is(result.error)).toBe(true);
		expect(github.ref("main")).toBe(pushed);
		/** The stale ref is not reused. */
		expect(await storage.resolve("main")).toBe(pushed);
	});

	test("fails with a conflict if the ref was deleted", async () => {
		const { storage } = setup();
		const main = (await storage.resolve("main"))!;
		await storage.createRef("cms/drafts/x", main);
		await storage.deleteRef("cms/drafts/x");

		const result = await storage.commit({
			ref: "cms/drafts/x",
			expectedRevision: main,
			changes: [{ type: "put", path: "content/news/c", data: { title: "C" } }],
			message: "Add c",
			author,
		});

		expect(result.isErr() && ConflictError.is(result.error)).toBe(true);
	});

	test("throws if github refuses a ref write, rather than reporting a conflict", async () => {
		const { github, storage } = setup();
		const base = (await storage.resolve("main"))!;
		github.protect("main");
		github.protect("cms/drafts/x");

		const rejections = await Promise.all([
			getRejection(
				storage.commit({
					ref: "main",
					expectedRevision: base,
					changes: [{ type: "put", path: "content/news/c", data: { title: "C" } }],
					message: "Add c",
					author,
				}),
			),
			getRejection(storage.createRef("cms/drafts/x", base)),
			getRejection(storage.deleteRef("main")),
		]);

		for (const error of rejections) {
			expect(String(error)).toContain("Repository rule violations found");
		}
		expect(github.ref("main")).toBe(base);
	});

	test("lists changed paths between revisions", async () => {
		const { github, storage } = setup();
		const before = (await storage.resolve("main"))!;
		const after = github.push("main", {
			"content/news/a/image.jpg": null,
			"content/news/b/index.json": JSON.stringify({ title: "B2" }),
			"content/news/c/index.json": "{}",
		});

		expect(await storage.diff(before, after)).toEqual([
			"content/news/a/image.jpg",
			"content/news/b/index.json",
			"content/news/c/index.json",
		]);
	});
});

test("trusts its own ref writes over lagging reads, for a while", async () => {
	let time = 0;
	const github = createFakeGitHub({ files: { "content/news/a/index.json": "{}" } });
	const client = createGitHubClient({
		repository: "owner/repo",
		auth: createStaticTokenProvider("t"),
		fetch: github.fetch,
	});
	const storage = createGitHubStorage({ client, refTtl: 0, now: () => time });
	const main = (await storage.resolve("main"))!;

	await storage.createRef("cms/drafts/x", main);
	await storage.deleteRef("cms/drafts/x");

	/** As if github still answered with the deleted ref, like it does for a few seconds. */
	await client.request({ method: "POST", path: "/git/refs", body: { ref: "refs/heads/cms/drafts/x", sha: main } });

	expect(await storage.resolve("cms/drafts/x")).toBeUndefined();

	time += 30_001;

	expect(await storage.resolve("cms/drafts/x")).toBe(main);
});

test("commits and reads binary files", async () => {
	const { github, storage } = setup();
	const base = (await storage.resolve("main"))!;
	const content = new Uint8Array([0, 255, 1, 254, 137, 80, 78, 71]);

	const revision = (
		await storage.commit({
			ref: "main",
			expectedRevision: base,
			changes: [
				{ type: "put-file", path: "content/media/photo-a1/photo.png", content },
				{ type: "put", path: "content/media/photo-a1", data: { filename: "photo.png" } },
			],
			message: "Upload",
			author,
		})
	).unwrap();

	expect(await storage.readFile(revision, "content/media/photo-a1/photo.png")).toEqual(content);
	expect(await storage.readFile(revision, "content/media/photo-a1/missing.png")).toBeUndefined();
	expect(await storage.list(revision, "content/media")).toEqual(["photo-a1"]);
	expect(github.requests.filter((request) => request === "POST /git/blobs")).toHaveLength(1);
});
