import type { Config } from "#/src/lib/cms/schema/config.ts";

/**
 * Pages are tagged with every collection, entry, and singleton they read. A change to an entry invalidates both its
 * entry tag - for pages which show that entry - and its collection tag - for pages which list the collection.
 *
 * Tags are sent as a comma-separated `Cache-Tag` header, so they must not contain commas. Collection names and entry
 * ids cannot, by construction.
 */
export const cacheTags = {
	/** Added to every page which reads content, to invalidate everything when the changes cannot be determined. */
	all: "cms",
	collection(name: string): string {
		return `cms:collection:${name}`;
	},
	entry(collection: string, id: string): string {
		return `cms:entry:${collection}:${id}`;
	},
	singleton(name: string): string {
		return `cms:singleton:${name}`;
	},
};

/**
 * Maps changed file paths - relative to the repository root, e.g. as listed in a github push event - to the cache tags
 * which need to be invalidated. Paths outside of any collection or singleton are ignored.
 */
export function getInvalidationTags(config: Config, paths: Iterable<string>): Array<string> {
	const tags = new Set<string>();

	for (const filePath of paths) {
		for (const [name, collection] of Object.entries(config.collections)) {
			const prefix = `${collection.path}/`;

			if (!filePath.startsWith(prefix)) {
				continue;
			}

			tags.add(cacheTags.collection(name));

			const segments = filePath.slice(prefix.length).split("/");

			/** Files directly in the collection directory do not belong to an entry. */
			if (segments.length > 1) {
				tags.add(cacheTags.entry(name, segments[0]!));
			}
		}

		for (const [name, singleton] of Object.entries(config.singletons)) {
			if (filePath.startsWith(`${singleton.path}/`)) {
				tags.add(cacheTags.singleton(name));
			}
		}
	}

	return [...tags].toSorted();
}

/**
 * Invalidates now, and again after `repeatAfter` milliseconds: a page which started rendering before a change, and
 * finishes after the first invalidation, would otherwise be cached with stale content. The delay only needs to be
 * longer than a page takes to render.
 */
export async function invalidateWithRepeat(params: {
	invalidate: (tags: Array<string>) => Promise<void>;
	tags: Array<string>;
	repeatAfter?: number;
}): Promise<void> {
	const { invalidate, tags, repeatAfter = 10_000 } = params;

	if (tags.length === 0) {
		return;
	}

	await invalidate(tags);

	setTimeout(() => {
		invalidate(tags).catch(() => {
			/** The first invalidation succeeded, so at worst a page stays stale until its `maxAge`. */
		});
	}, repeatAfter);
}
