import { describe, expect, test } from "bun:test";

import * as v from "valibot";

import { collection, defineConfig, fields, singleton } from "#/src/lib/cms/schema/index.ts";
import { createGitHubClient, createStaticTokenProvider } from "#/src/lib/cms/storage/github/client.ts";
import { createGitHubStorage } from "#/src/lib/cms/storage/github/storage.ts";
import {
	EntryConflictError,
	EntryExistsError,
	EntryNotFoundError,
	type EntryTarget,
	EntryValidationError,
	createWriter,
} from "#/src/lib/cms/writer.ts";
import { createFakeGitHub } from "#/tests/cms/github/fake-github.ts";

const config = defineConfig({
	collections: {
		news: collection({
			label: "News",
			path: "content/news",
			slug: { from: "title" },
			id: { validation: [v.check((id) => id !== "reserved", "Reserved.")] },
			fields: {
				title: fields.text({ label: "Title", validation: [v.minLength(1)] }),
				tags: fields.array(fields.text({ label: "Tag", validation: [v.minLength(1)] }), { label: "Tags" }),
			},
		}),
	},
	singletons: {
		settings: singleton({
			label: "Site settings",
			path: "content/settings",
			fields: { title: fields.text({ label: "Title" }) },
		}),
	},
});

const author = { name: "Jane Doe", email: "jane@example.org" };

function setup() {
	const github = createFakeGitHub({
		files: {
			"content/news/a/index.json": JSON.stringify({ title: "A", tags: [] }),
			/** Created before the collection reserved its id. */
			"content/news/reserved/index.json": JSON.stringify({ title: "Reserved", tags: [] }),
		},
	});
	const client = createGitHubClient({
		repository: "owner/repo",
		auth: createStaticTokenProvider("t"),
		fetch: github.fetch,
	});
	const storage = createGitHubStorage({ client, refTtl: 0 });
	const writer = createWriter({ config, storage });

	return { github, storage, writer };
}

function news(id: string): EntryTarget {
	return { kind: "collection", collection: "news", id };
}

describe("writer", () => {
	test("creates entries, with a descriptive commit message", async () => {
		const { github, writer } = setup();

		const result = await writer.save({
			target: news("b"),
			data: { title: " B ", tags: [] },
			expect: { type: "absent" },
			author,
			verb: "Create",
		});

		expect(result.unwrap().paths).toEqual(["content/news/b/index.json"]);
		expect(github.commit(github.ref("main")!)).toMatchObject({ message: 'Create news "B"', author });
		/** Stores the validated output, e.g. with trimmed text. */
		expect(JSON.parse(github.file("main", "content/news/b/index.json")!)).toEqual({ title: "B", tags: [] });
	});

	test("does not overwrite existing entries when expecting none", async () => {
		const { writer } = setup();

		const result = await writer.save({
			target: news("a"),
			data: { title: "A2", tags: [] },
			expect: { type: "absent" },
			author,
			verb: "Create",
		});

		expect(result.isErr() && EntryExistsError.is(result.error)).toBe(true);
	});

	test("reports editor-friendly validation issues with their paths", async () => {
		const { writer } = setup();

		const result = await writer.save({
			target: news("b"),
			data: { tags: ["x", ""] },
			expect: { type: "absent" },
			author,
			verb: "Create",
		});

		expect(result.isErr() && EntryValidationError.is(result.error) && result.error.issues).toEqual([
			{ path: "title", message: "Required." },
			{ path: "tags.1", message: "Required." },
		]);
	});

	test("rejects invalid ids, and unknown collections", async () => {
		const { writer } = setup();

		const invalid = await writer.save({
			target: news("Not Valid"),
			data: { title: "X", tags: [] },
			expect: { type: "absent" },
			author,
			verb: "Create",
		});
		const unknown = await writer.save({
			target: { kind: "collection", collection: "events", id: "x" },
			data: {},
			expect: { type: "absent" },
			author,
			verb: "Create",
		});

		expect(invalid.isErr() && EntryNotFoundError.is(invalid.error)).toBe(true);
		expect(unknown.isErr() && EntryNotFoundError.is(unknown.error)).toBe(true);
	});

	test("saves on top of unrelated changes made in the meantime", async () => {
		const { github, storage, writer } = setup();
		const base = (await storage.resolve("main"))!;
		github.push("main", { "content/news/other/index.json": JSON.stringify({ title: "Other", tags: [] }) });

		const result = await writer.save({
			target: news("a"),
			data: { title: "A2", tags: [] },
			expect: { type: "unchanged", since: base },
			author,
			verb: "Update",
		});

		expect(result.isOk()).toBe(true);
		expect(github.file("main", "content/news/other/index.json")).toBeDefined();
		expect(JSON.parse(github.file("main", "content/news/a/index.json")!)).toEqual({ title: "A2", tags: [] });
	});

	test("fails if the entry itself was changed in the meantime", async () => {
		const { github, storage, writer } = setup();
		const base = (await storage.resolve("main"))!;
		github.push("main", { "content/news/a/index.json": JSON.stringify({ title: "Changed elsewhere", tags: [] }) });

		const result = await writer.save({
			target: news("a"),
			data: { title: "A2", tags: [] },
			expect: { type: "unchanged", since: base },
			author,
			verb: "Update",
		});

		expect(result.isErr() && EntryConflictError.is(result.error)).toBe(true);
		expect(JSON.parse(github.file("main", "content/news/a/index.json")!)).toEqual({
			title: "Changed elsewhere",
			tags: [],
		});
	});

	test("deletes entries, unless they were changed in the meantime", async () => {
		const { github, storage, writer } = setup();
		const base = (await storage.resolve("main"))!;

		const result = await writer.remove({ target: news("a"), since: base, author });

		expect(result.isOk()).toBe(true);
		expect(github.commit(github.ref("main")!)).toMatchObject({ message: 'Delete news "A"' });
		expect(github.file("main", "content/news/a/index.json")).toBeUndefined();

		const again = await writer.remove({ target: news("a"), since: base, author });

		expect(again.isErr() && EntryConflictError.is(again.error)).toBe(true);
	});

	test("applies the collection's id rules to new entries only", async () => {
		const { storage, writer } = setup();
		const head = await storage.resolve("main");

		const created = await writer.save({
			target: news("reserved"),
			data: { title: "X", tags: [] },
			expect: { type: "absent" },
			author,
			verb: "Create",
		});
		const updated = await writer.save({
			target: news("reserved"),
			data: { title: "Updated", tags: [] },
			expect: { type: "unchanged", since: head! },
			author,
			verb: "Update",
		});

		expect(created.isErr() && EntryValidationError.is(created.error) && created.error.issues).toEqual([
			{ path: "", message: "Reserved." },
		]);
		expect(updated.isOk()).toBe(true);
	});

	test("writes singletons", async () => {
		const { github, writer } = setup();

		const result = await writer.save({
			target: { kind: "singleton", singleton: "settings" },
			data: { title: "Site" },
			expect: { type: "absent" },
			author,
			verb: "Update",
		});

		expect(result.isOk()).toBe(true);
		expect(github.commit(github.ref("main")!)).toMatchObject({ message: "Update Site settings" });
		expect(JSON.parse(github.file("main", "content/settings/index.json")!)).toEqual({ title: "Site" });
	});
});
