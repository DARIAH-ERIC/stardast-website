import { TaggedError } from "better-result";
import * as v from "valibot";

import { cacheTags } from "#/src/lib/cms/cache.ts";
import type { CollectionName, Config, InferEntry, SingletonName } from "#/src/lib/cms/schema/config.ts";
import { EntryIdSchema } from "#/src/lib/cms/schema/fields.ts";
import { type ContentStorage, type Ref, type Revision, publishedRef } from "#/src/lib/cms/storage/types.ts";

export interface Entry<TCollection extends string = string, TData = unknown> {
	collection: TCollection;
	id: string;
	data: TData;
}

export type CollectionEntry<TConfig extends Config, TName extends CollectionName<TConfig>> = Entry<
	TName,
	InferEntry<TConfig["collections"][TName]>
>;

export type SingletonData<TConfig extends Config, TName extends SingletonName<TConfig>> = InferEntry<
	TConfig["singletons"][TName]
>;

/** Content in the repository does not match the schema, e.g. after a manual edit, or a schema change. */
export class ContentValidationError extends TaggedError("ContentValidationError")<{
	readonly message: string;
	readonly path: string;
	readonly revision: Revision;
}> {}

export class RefNotFoundError extends TaggedError("RefNotFoundError")<{
	readonly message: string;
	readonly ref: Ref;
}> {}

export interface Reader<TConfig extends Config> {
	/** Returns `undefined` if there is no entry with that id. */
	entry: <TName extends CollectionName<TConfig>>(
		name: TName,
		id: string,
	) => Promise<CollectionEntry<TConfig, TName> | undefined>;
	/** Resolves references: returns the entries in the order of `ids`, skipping ids without an entry. */
	entries: <TName extends CollectionName<TConfig>>(
		name: TName,
		ids: ReadonlyArray<string>,
	) => Promise<Array<CollectionEntry<TConfig, TName>>>;
	/** Returns all entries, ordered by the collection's `sort` option, or by id. */
	list: <TName extends CollectionName<TConfig>>(name: TName) => Promise<Array<CollectionEntry<TConfig, TName>>>;
	/** Returns `undefined` if the singleton has not been created yet. */
	singleton: <TName extends SingletonName<TConfig>>(name: TName) => Promise<SingletonData<TConfig, TName> | undefined>;
}

/**
 * Reads and validates content from a single, consistent revision: the ref is resolved once, on first read. Create one
 * reader per request, so that a request never mixes content from before and after a publish.
 */
export function createReader<TConfig extends Config>(params: {
	config: TConfig;
	storage: ContentStorage;
	/** Defaults to the published content. */
	ref?: Ref;
	/** Called with the cache tags of every read, before the read, so that a page is tagged even if it 404s. */
	onRead?: (tags: Array<string>) => void;
	/**
	 * Entry directories to read from another revision, e.g. drafts for a preview. Overlaid entries which only exist in
	 * their revision - e.g. new, unpublished entries - are included in lists.
	 */
	overlays?: ReadonlyArray<{ path: string; revision: Revision }>;
}): Reader<TConfig> {
	const { config, storage, ref = publishedRef, onRead, overlays = [] } = params;

	const overlayRevisions = new Map(overlays.map((overlay) => [overlay.path, overlay.revision]));

	let revision: Promise<Revision> | undefined;

	function getRevision(): Promise<Revision> {
		revision ??= storage.resolve(ref).then((resolved) => {
			if (resolved == null) {
				throw new RefNotFoundError({ message: `Ref "${ref}" does not exist.`, ref });
			}

			return resolved;
		});

		return revision;
	}

	async function readAndParse<TSchema extends v.GenericSchema>(
		schema: TSchema,
		path: string,
	): Promise<v.InferOutput<TSchema> | undefined> {
		const revision = overlayRevisions.get(path) ?? (await getRevision());
		const raw = await storage.read(revision, path);

		if (raw === undefined) {
			return undefined;
		}

		const result = v.safeParse(schema, raw);

		if (!result.success) {
			throw new ContentValidationError({
				message: `Invalid content at "${path}" (revision ${revision}):\n${v.summarize(result.issues)}`,
				path,
				revision,
			});
		}

		return result.output;
	}

	async function readEntry<TName extends CollectionName<TConfig>>(
		name: TName,
		id: string,
	): Promise<CollectionEntry<TConfig, TName> | undefined> {
		/** Ids come from urls, so anything which is not a valid id is simply not found. */
		if (!v.is(EntryIdSchema, id)) {
			return undefined;
		}

		const collection = config.collections[name]!;
		const data = await readAndParse(collection.schema, `${collection.path}/${id}`);

		if (data === undefined) {
			return undefined;
		}

		return { collection: name, id, data: data as InferEntry<TConfig["collections"][TName]> };
	}

	return {
		async entry<TName extends CollectionName<TConfig>>(
			name: TName,
			id: string,
		): Promise<CollectionEntry<TConfig, TName> | undefined> {
			onRead?.([cacheTags.entry(name, id)]);

			return readEntry(name, id);
		},

		async entries<TName extends CollectionName<TConfig>>(
			name: TName,
			ids: ReadonlyArray<string>,
		): Promise<Array<CollectionEntry<TConfig, TName>>> {
			onRead?.(ids.map((id) => cacheTags.entry(name, id)));

			const entries = await Promise.all(ids.map((id) => readEntry(name, id)));

			return entries.filter((entry) => entry !== undefined);
		},

		async list<TName extends CollectionName<TConfig>>(name: TName): Promise<Array<CollectionEntry<TConfig, TName>>> {
			onRead?.([cacheTags.collection(name)]);

			const collection = config.collections[name]!;
			const prefix = `${collection.path}/`;
			const overlaid = [...overlayRevisions.keys()]
				.filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
				.map((path) => path.slice(prefix.length));
			const ids = [...new Set([...(await storage.list(await getRevision(), collection.path)), ...overlaid])];
			const entries = (await Promise.all(ids.map((id) => readEntry(name, id)))).filter((entry) => entry !== undefined);

			const { sort } = collection;

			if (sort != null) {
				const direction = sort.direction === "asc" ? 1 : -1;

				entries.sort((a, b) => {
					const order = compare(
						(a.data as Record<string, unknown>)[sort.field],
						(b.data as Record<string, unknown>)[sort.field],
						direction,
					);

					return order === 0 ? a.id.localeCompare(b.id) : order;
				});
			}

			return entries;
		},

		async singleton<TName extends SingletonName<TConfig>>(
			name: TName,
		): Promise<SingletonData<TConfig, TName> | undefined> {
			onRead?.([cacheTags.singleton(name)]);

			const singleton = config.singletons[name]!;

			return readAndParse(singleton.schema, singleton.path);
		},
	};
}

/** Missing values sort last, regardless of direction. */
function compare(a: unknown, b: unknown, direction: 1 | -1): number {
	if (a == null || b == null) {
		return a == null ? (b == null ? 0 : 1) : -1;
	}

	if (typeof a === "number" && typeof b === "number") {
		return (a - b) * direction;
	}

	if (typeof a === "string" && typeof b === "string") {
		return a.localeCompare(b) * direction;
	}

	if (typeof a === "boolean" && typeof b === "boolean") {
		return (Number(a) - Number(b)) * direction;
	}

	return 0;
}
