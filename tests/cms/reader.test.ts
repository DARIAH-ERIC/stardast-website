import { describe, expect, test } from "bun:test";

import { Result } from "better-result";

import { ContentValidationError, RefNotFoundError, createReader } from "#/src/lib/cms/reader.ts";
import { collection, defineConfig, fields, optional, singleton } from "#/src/lib/cms/schema/index.ts";
import type { ContentStorage } from "#/src/lib/cms/storage/types.ts";
import { getRejection } from "#/tests/helpers.ts";

const config = defineConfig({
	collections: {
		news: collection({
			label: "News",
			path: "content/news",
			slug: { from: "title" },
			sort: { field: "date", direction: "desc" },
			fields: {
				title: fields.text({ label: "Title" }),
				date: optional(fields.date({ label: "Date" })),
				authors: fields.array(fields.reference({ label: "Author", collection: "people" }), { label: "Authors" }),
			},
		}),
		people: collection({
			label: "People",
			path: "content/people",
			slug: { from: "name" },
			fields: { name: fields.text({ label: "Name" }) },
		}),
	},
	singletons: {
		settings: singleton({
			label: "Settings",
			path: "content/settings",
			fields: { title: fields.text({ label: "Title" }) },
		}),
	},
});

/** Holds entries by path, at a single revision. */
function createMemoryStorage(entries: Record<string, unknown>): ContentStorage & { reads: Array<string> } {
	const reads: Array<string> = [];

	return {
		name: "memory",
		reads,
		resolve(ref) {
			return Promise.resolve(ref === "main" ? "r1" : undefined);
		},
		read(revision, path) {
			reads.push(`${revision}:${path}`);
			return Promise.resolve(entries[path]);
		},
		list(_revision, directory) {
			const names = Object.keys(entries)
				.filter((path) => path.startsWith(`${directory}/`))
				.map((path) => path.slice(directory.length + 1));
			return Promise.resolve(names.toSorted());
		},
		commit() {
			return Promise.resolve(Result.ok("r2"));
		},
		readFile: () => Promise.resolve(undefined),
		listRefs: () => Promise.resolve([]),
		createRef: () => Promise.resolve(Result.ok(undefined)),
		deleteRef: () => Promise.resolve(),
		getMergeBase: () => Promise.resolve("r1"),
	};
}

const storage = createMemoryStorage({
	"content/news/a": { title: "A", date: "2026-01-01", authors: ["jane"] },
	"content/news/b": { title: "B", date: "2026-03-01", authors: [] },
	"content/news/c": { title: "C", authors: [] },
	"content/news/d": { title: "D", date: "2026-03-01", authors: ["missing", "jane"] },
	"content/people/jane": { name: "Jane" },
	"content/settings": { title: "Site" },
});

function setup(entries?: Record<string, unknown>) {
	const tags: Array<string> = [];
	const reader = createReader({
		config,
		storage: entries != null ? createMemoryStorage(entries) : storage,
		onRead(newTags) {
			tags.push(...newTags);
		},
	});

	return { reader, tags };
}

describe("reader", () => {
	test("reads and validates an entry", async () => {
		const { reader, tags } = setup();

		expect(await reader.entry("news", "a")).toEqual({
			collection: "news",
			id: "a",
			data: { title: "A", date: "2026-01-01", authors: ["jane"] },
		});
		expect(tags).toEqual(["cms:entry:news:a"]);
	});

	test("tags missing entries too, so that creating them invalidates the 404", async () => {
		const { reader, tags } = setup();

		expect(await reader.entry("news", "missing")).toBeUndefined();
		expect(tags).toEqual(["cms:entry:news:missing"]);
	});

	test("treats invalid ids as not found, without reading", async () => {
		const memory = createMemoryStorage({});
		const reader = createReader({ config, storage: memory });

		expect(await reader.entry("news", "../people/jane")).toBeUndefined();
		expect(memory.reads).toEqual([]);
	});

	test("lists entries sorted by the sort field, with missing values last, and ties by id", async () => {
		const { reader, tags } = setup();

		const entries = await reader.list("news");

		expect(entries.map((entry) => entry.id)).toEqual(["b", "d", "a", "c"]);
		expect(tags).toEqual(["cms:collection:news"]);
	});

	test("resolves references in order, skipping missing entries", async () => {
		const { reader, tags } = setup();

		const entries = await reader.entries("people", ["missing", "jane"]);

		expect(entries.map((entry) => entry.data.name)).toEqual(["Jane"]);
		expect(tags).toEqual(["cms:entry:people:missing", "cms:entry:people:jane"]);
	});

	test("reads singletons", async () => {
		const { reader, tags } = setup();

		expect(await reader.singleton("settings")).toEqual({ title: "Site" });
		expect(tags).toEqual(["cms:singleton:settings"]);
	});

	test("throws on invalid content", async () => {
		const { reader } = setup({ "content/news/a": { title: 1, authors: [] } });

		expect(await getRejection(reader.entry("news", "a"))).toBeInstanceOf(ContentValidationError);
	});

	test("resolves the ref once per reader", async () => {
		const memory = createMemoryStorage({ "content/people/jane": { name: "Jane" } });
		let resolves = 0;
		const reader = createReader({
			config,
			storage: {
				...memory,
				resolve(ref) {
					resolves++;
					return memory.resolve(ref);
				},
			},
		});

		await reader.entry("people", "jane");
		await reader.list("people");

		expect(resolves).toBe(1);
		expect(memory.reads.every((read) => read.startsWith("r1:"))).toBe(true);
	});

	test("throws for unknown refs", async () => {
		const reader = createReader({ config, storage, ref: "draft/missing" });

		expect(await getRejection(reader.entry("news", "a"))).toBeInstanceOf(RefNotFoundError);
	});
});
