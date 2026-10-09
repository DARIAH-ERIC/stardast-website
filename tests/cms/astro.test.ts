import { expect, test } from "bun:test";

import type { APIContext } from "astro";
import { Result } from "better-result";

import { createCachedReader } from "#/src/lib/cms/astro.ts";
import { collection, defineConfig, fields } from "#/src/lib/cms/schema/index.ts";

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

const storage = {
	name: "memory",
	resolve: () => Promise.resolve("r1"),
	read: () => Promise.resolve({ title: "A" }),
	list: () => Promise.resolve(["a"]),
	commit: () => Promise.resolve(Result.ok("r2")),
	readFile: () => Promise.resolve(undefined),
	listRefs: () => Promise.resolve([]),
	createRef: () => Promise.resolve(Result.ok(undefined)),
	deleteRef: () => Promise.resolve(),
	getMergeBase: () => Promise.resolve("r1"),
};

function createCache(options: { maxAge?: number } = {}) {
	const calls: Array<unknown> = [];
	const state = { ...options };

	const cache = {
		enabled: true,
		set(input: Record<string, unknown>) {
			calls.push(input);
			Object.assign(state, input.maxAge !== undefined ? { maxAge: input.maxAge } : {});
		},
		get options() {
			return state;
		},
	} as unknown as APIContext["cache"];

	return { cache, calls };
}

test("tags reads, and sets a long stale-while-revalidate window with the max age", async () => {
	const { cache, calls } = createCache();
	const reader = createCachedReader({ config, storage, context: { cache } });

	await reader.entry("news", "a");
	await reader.list("news");

	expect(calls).toEqual([
		{ tags: ["cms", "cms:entry:news:a"] },
		{ maxAge: 86_400, swr: 604_800 },
		{ tags: ["cms", "cms:collection:news"] },
	]);
});

test("keeps a max age set by the page", async () => {
	const { cache, calls } = createCache({ maxAge: 60 });
	const reader = createCachedReader({ config, storage, context: { cache } });

	await reader.entry("news", "a");

	expect(calls).toEqual([{ tags: ["cms", "cms:entry:news:a"] }]);
});
