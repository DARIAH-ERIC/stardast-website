import type { Reader } from "#/src/lib/cms/reader.ts";
import type { Config } from "#/src/lib/cms/schema/config.ts";

/**
 * The public paths of all published entries and singletons, see their `preview` - e.g. for a sitemap. Collections and
 * singletons without a `preview`, e.g. ones only shown as part of other pages, have none.
 */
export async function getContentPaths<TConfig extends Config>(
	config: TConfig,
	reader: Reader<TConfig>,
): Promise<Array<string>> {
	const collectionPaths = await Promise.all(
		Object.entries(config.collections).map(async ([name, { preview }]) => {
			if (preview == null) {
				return [];
			}

			const entries = await reader.list(name);

			return entries.map((entry) => preview({ id: entry.id, data: entry.data as never }));
		}),
	);

	const singletonPaths = await Promise.all(
		Object.entries(config.singletons).map(async ([name, { preview }]) => {
			if (preview == null) {
				return [];
			}

			const data = await reader.singleton(name);

			return data != null ? [preview({ data: data as never })] : [];
		}),
	);

	return [...new Set([...singletonPaths.flat(), ...collectionPaths.flat()])];
}
