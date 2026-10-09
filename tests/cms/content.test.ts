import { expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import * as v from "valibot";

import { config } from "#/src/cms/config.ts";
import { createReader } from "#/src/lib/cms/reader.ts";
import type { AnyCollection, AnySingleton } from "#/src/lib/cms/schema/config.ts";
import { collectReferences } from "#/src/lib/cms/schema/references.ts";
import { createFilesystemStorage } from "#/src/lib/cms/storage/filesystem.ts";

/** Guards the content in the repository against invalid manual edits, and against schema changes without migration. */

type CollectionName = keyof typeof config.collections;

type SingletonName = keyof typeof config.singletons;

const storage = createFilesystemStorage({ root: path.join(import.meta.dirname, "../..") });

for (const name of Object.keys(config.collections) as Array<CollectionName>) {
	test(`entries in "${name}" are valid, and their references resolve`, async () => {
		const reader = createReader({ config, storage });
		const entries = await reader.list(name);

		for (const entry of entries) {
			expect(v.is(config.collections[name].idSchema, entry.id), `${name}/${entry.id} has a valid id`).toBe(true);
		}

		const references = entries.flatMap((entry) =>
			collectReferences(config.collections[name].fields, entry.data).map((reference) => {
				return {
					source: entry.id,
					reference,
				};
			}),
		);

		const targets = await Promise.all(
			references.map(({ reference }) => reader.entry(reference.collection as CollectionName, reference.id)),
		);

		references.forEach(({ source, reference }, index) => {
			const description = `${name}/${source} ${reference.path} -> ${reference.collection}/${reference.id}`;

			expect(targets[index], description).toBeDefined();
		});
	});
}

for (const name of Object.keys(config.singletons) as Array<SingletonName>) {
	test(`singleton "${name}" exists, is valid, and its references resolve`, async () => {
		const reader = createReader({ config, storage });
		const data = await reader.singleton(name);

		expect(data).toBeDefined();

		const references = collectReferences(config.singletons[name].fields, data);

		const targets = await Promise.all(
			references.map((reference) => reader.entry(reference.collection as CollectionName, reference.id)),
		);

		references.forEach((reference, index) => {
			const description = `${name} ${reference.path} -> ${reference.collection}/${reference.id}`;

			expect(targets[index], description).toBeDefined();
		});
	});
}

test("pages cannot have the id of a top-level route or public directory, which would take precedence", async () => {
	const root = path.join(import.meta.dirname, "../..");
	const [routes, publicFiles] = await Promise.all([
		fs.readdir(path.join(root, "src/pages"), { withFileTypes: true }),
		fs.readdir(path.join(root, "public"), { withFileTypes: true }),
	]);

	const names = [
		...routes.map((route) => (route.isDirectory() ? route.name : route.name.replace(/\.[^.]+$/, ""))),
		...publicFiles.filter((file) => file.isDirectory()).map((file) => file.name),
	].filter((name) => !name.startsWith("[") && name !== "index");

	for (const name of names) {
		expect(v.is(config.collections.pages.idSchema, name), `"${name}" is reserved`).toBe(false);
	}
});

/**
 * The paths of all pages on this site: the urls of entries and singletons, see their `preview`, and static routes in
 * `src/pages/`, e.g. `/search`. Endpoints are left out, since they are not linked to.
 */
async function getSitePaths(reader: ReturnType<typeof createReader>): Promise<Set<string>> {
	const root = path.join(import.meta.dirname, "../../src/pages");
	const files = await fs.readdir(root, { recursive: true });

	const staticPaths = files
		.filter((file) => file.endsWith(".astro") && !file.includes("["))
		.map((file) => `/${file.replace(/\.astro$/, "").replace(/(?:^|\/)index$/, "")}`);

	const collectionPaths = await Promise.all(
		(Object.keys(config.collections) as Array<CollectionName>).map(async (name) => {
			const { preview } = config.collections[name] as AnyCollection;

			if (preview == null) {
				return [];
			}

			const entries = await reader.list(name);

			return entries.map((entry) => preview({ id: entry.id, data: entry.data as never }));
		}),
	);

	const singletonPaths = await Promise.all(
		(Object.keys(config.singletons) as Array<SingletonName>).map(async (name) => {
			const { preview } = config.singletons[name] as AnySingleton;
			const data = await reader.singleton(name);

			return preview != null && data != null ? [preview({ data: data as never })] : [];
		}),
	);

	return new Set([...staticPaths, ...collectionPaths.flat(), ...singletonPaths.flat()]);
}

test("internal links in the navigation and the mailing list signup resolve", async () => {
	const reader = createReader({ config, storage });
	const [navigation, newsletter] = await Promise.all([reader.singleton("navigation"), reader.singleton("newsletter")]);

	const links = [
		...(navigation?.main ?? []).flatMap((entry) => (entry.type === "menu" ? entry.data.links : [entry.data])),
		...(navigation?.legal ?? []),
		...(newsletter?.privacyPolicy != null ? [{ label: "Privacy policy", href: newsletter.privacyPolicy }] : []),
	];

	/** External links, and e.g. `mailto:`, are not checked. */
	const internalLinks = links.filter((link) => link.href.startsWith("/") && !link.href.startsWith("//"));

	expect(internalLinks.length).toBeGreaterThan(0);

	const sitePaths = await getSitePaths(reader);

	expect(sitePaths).toContain("/");

	/** Query and fragment are ignored, so anchors, e.g. `/about#partners`, are not checked. */
	for (const link of internalLinks) {
		const { pathname } = new URL(link.href, "http://localhost");

		expect(sitePaths.has(pathname.replace(/(?<=.)\/$/, "")), `"${link.label}" -> ${link.href}`).toBe(true);
	}
});
