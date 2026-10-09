import { expect, test } from "bun:test";

import { getInvalidationTags } from "#/src/lib/cms/cache.ts";
import { collection, defineConfig, fields, singleton } from "#/src/lib/cms/schema/index.ts";

const config = defineConfig({
	collections: {
		news: collection({
			label: "News",
			path: "content/news",
			slug: { from: "title" },
			fields: { title: fields.text({ label: "Title" }) },
		}),
	},
	singletons: {
		settings: singleton({ label: "Settings", path: "content/settings", fields: {} }),
	},
});

test("maps changed files to entry, collection, and singleton tags", () => {
	expect(
		getInvalidationTags(config, [
			"content/news/my-post/index.json",
			"content/news/other-post/image.jpg",
			"content/settings/index.json",
		]),
	).toEqual(["cms:collection:news", "cms:entry:news:my-post", "cms:entry:news:other-post", "cms:singleton:settings"]);
});

test("ignores files outside of collections and singletons", () => {
	expect(getInvalidationTags(config, ["src/pages/index.astro", "content/newsletter/index.json"])).toEqual([]);
});

test("files directly in a collection directory only invalidate the collection", () => {
	expect(getInvalidationTags(config, ["content/news/readme.md"])).toEqual(["cms:collection:news"]);
});
