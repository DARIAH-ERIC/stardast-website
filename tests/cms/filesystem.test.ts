import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { createFilesystemStorage } from "#/src/lib/cms/storage/filesystem.ts";
import type { ContentStorage } from "#/src/lib/cms/storage/types.ts";
import { getRejection } from "#/tests/helpers.ts";

const author = { name: "Test", email: "test@example.org" };

describe("filesystem storage", () => {
	let root: string;
	let storage: ContentStorage;

	beforeEach(async () => {
		root = await mkdtemp(path.join(tmpdir(), "cms-filesystem-"));
		storage = createFilesystemStorage({ root });
	});

	afterEach(async () => {
		await rm(root, { force: true, recursive: true });
	});

	test("only resolves the main ref", async () => {
		expect(await storage.resolve("main")).toBeString();
		expect(await storage.resolve("draft/news/foo")).toBeUndefined();
	});

	test("writes, lists, reads, and deletes entries", async () => {
		const revision = (await storage.resolve("main"))!;

		const result = await storage.commit({
			ref: "main",
			expectedRevision: revision,
			changes: [
				{ type: "put", path: "content/news/b", data: { title: "B" } },
				{ type: "put", path: "content/news/a", data: { title: "A" } },
			],
			message: "Add news",
			author,
		});

		expect(result.isOk()).toBe(true);
		expect(await storage.list(revision, "content/news")).toEqual(["a", "b"]);
		expect(await storage.read(revision, "content/news/a")).toEqual({ title: "A" });
		expect(await Bun.file(path.join(root, "content/news/a/index.json")).text()).toBe('{\n\t"title": "A"\n}\n');

		await storage.commit({
			ref: "main",
			expectedRevision: revision,
			changes: [{ type: "delete", path: "content/news/a" }],
			message: "Delete news",
			author,
		});

		expect(await storage.list(revision, "content/news")).toEqual(["b"]);
		expect(await storage.read(revision, "content/news/a")).toBeUndefined();
	});

	test("lists a missing directory as empty", async () => {
		expect(await storage.list("working-tree", "content/missing")).toEqual([]);
	});

	test("ignores directories without an index file", async () => {
		await Bun.write(path.join(root, "content/news/a/other.json"), "{}");

		expect(await storage.list("working-tree", "content/news")).toEqual([]);
	});

	test("rejects paths outside of the root", async () => {
		const rejection = await getRejection(storage.read("working-tree", "../outside"));

		expect((rejection as Error).message).toMatch(/outside of the content root/);
	});

	test("rejects commits to refs which do not exist", async () => {
		const rejection = await getRejection(
			storage.commit({ ref: "draft", expectedRevision: "working-tree", changes: [], message: "", author }),
		);

		expect((rejection as Error).message).toMatch(/does not exist/);
	});
});

describe("filesystem storage binary files", () => {
	test("writes and reads binary files, also on overlay refs", async () => {
		const root = await mkdtemp(path.join(tmpdir(), "cms-binary-"));
		const storage = createFilesystemStorage({ root });
		const content = new Uint8Array([0, 255, 1, 254]);

		await storage.commit({
			ref: "main",
			expectedRevision: "working-tree",
			changes: [{ type: "put-file", path: "content/media/a/a.png", content }],
			message: "",
			author,
		});
		await storage.createRef("draft", "working-tree");

		expect(await storage.readFile("working-tree", "content/media/a/a.png")).toEqual(content);
		expect(await storage.readFile((await storage.resolve("draft"))!, "content/media/a/a.png")).toEqual(content);
		expect(await storage.readFile("working-tree", "content/media/a/b.png")).toBeUndefined();

		await rm(root, { force: true, recursive: true });
	});
});
