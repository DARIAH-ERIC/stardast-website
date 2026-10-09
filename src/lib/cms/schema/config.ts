import type * as v from "valibot";

import {
	type ArrayField,
	type BlocksField,
	EntryIdSchema,
	type Field,
	type Fields,
	type FieldsSchema,
	type InferFields,
	type ObjectField,
	createDefaultValue,
	createFieldsSchema,
	isReferenceField,
	refine,
} from "#/src/lib/cms/schema/fields.ts";
import type { RichTextField } from "#/src/lib/cms/schema/rich-text.ts";

export interface PreviewEntry<TFields extends Fields> {
	id: string;
	data: InferFields<TFields>;
}

export interface Collection<TFields extends Fields = Fields> {
	readonly kind: "collection";
	readonly label: string;
	/** Directory in the content repository which holds one `<id>/index.json` per entry. */
	readonly path: string;
	/** Field the admin ui derives the id of a new entry from. */
	readonly slug: { readonly from: keyof TFields & string };
	/**
	 * Additional valibot actions for the ids of new entries, e.g. to reserve ids which clash with other routes. Existing
	 * entries are not checked, so that they stay editable when the rules change.
	 */
	readonly id?: { readonly validation?: ReadonlyArray<v.GenericPipeItem<string, string>> };
	readonly sort?: { readonly field: keyof TFields & string; readonly direction: "asc" | "desc" };
	readonly fields: TFields;
	readonly schema: FieldsSchema<TFields>;
	/** Validates the id of a new entry: `EntryIdSchema`, and the collection's own `id.validation`. */
	readonly idSchema: v.GenericSchema<string>;
	readonly defaultValue: () => InferFields<TFields>;
	/** Public url of an entry, used for previews and links from the admin ui. */
	readonly preview?: (entry: PreviewEntry<TFields>) => string;
}

export function collection<const TFields extends Fields>(
	config: Omit<Collection<TFields>, "defaultValue" | "idSchema" | "kind" | "schema">,
): Collection<TFields> {
	return {
		...config,
		kind: "collection",
		schema: createFieldsSchema(config.fields),
		idSchema: refine(EntryIdSchema, config.id?.validation),
		defaultValue: () => createDefaultValue(config.fields),
	};
}

export interface Singleton<TFields extends Fields = Fields> {
	readonly kind: "singleton";
	readonly label: string;
	/** Directory in the content repository which holds the singleton's `index.json`. */
	readonly path: string;
	readonly fields: TFields;
	readonly schema: FieldsSchema<TFields>;
	readonly defaultValue: () => InferFields<TFields>;
	readonly preview?: (entry: Omit<PreviewEntry<TFields>, "id">) => string;
}

export function singleton<const TFields extends Fields>(
	config: Omit<Singleton<TFields>, "defaultValue" | "kind" | "schema">,
): Singleton<TFields> {
	return {
		...config,
		kind: "singleton",
		schema: createFieldsSchema(config.fields),
		defaultValue: () => createDefaultValue(config.fields),
	};
}

/**
 * Structural supertypes of `Collection` and `Singleton`: their schemas are invariant in the field types, so e.g. a
 * `Collection<{ title: TextField }>` is not assignable to `Collection<Fields>`.
 */
export interface AnyCollection {
	readonly kind: "collection";
	readonly label: string;
	readonly path: string;
	readonly slug: { readonly from: string };
	readonly sort?: { readonly field: string; readonly direction: "asc" | "desc" };
	readonly fields: Fields;
	readonly schema: v.GenericSchema;
	readonly idSchema: v.GenericSchema<string>;
	readonly defaultValue: () => unknown;
	/** `data` is typed as `never`, so that every collection's `preview` is assignable - pass validated data only. */
	readonly preview?: (entry: { id: string; data: never }) => string;
}

export interface AnySingleton {
	readonly kind: "singleton";
	readonly label: string;
	readonly path: string;
	readonly fields: Fields;
	readonly schema: v.GenericSchema;
	readonly defaultValue: () => unknown;
	/** See `AnyCollection["preview"]`. */
	readonly preview?: (entry: { data: never }) => string;
}

export interface Config<
	TCollections extends Readonly<Record<string, AnyCollection>> = Readonly<Record<string, AnyCollection>>,
	TSingletons extends Readonly<Record<string, AnySingleton>> = Readonly<Record<string, AnySingleton>>,
> {
	readonly collections: TCollections;
	readonly singletons: TSingletons;
}

export type CollectionName<TConfig extends Config> = keyof TConfig["collections"] & string;

export type SingletonName<TConfig extends Config> = keyof TConfig["singletons"] & string;

export type InferEntry<T extends { schema: v.GenericSchema }> = v.InferOutput<T["schema"]>;

const pathPattern = /^content(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+$/;

/**
 * Checks what the types cannot: that paths are unique and do not overlap - so every file in the content repository
 * belongs to at most one collection or singleton - and that references point to existing collections.
 */
export function defineConfig<
	const TCollections extends Readonly<Record<string, AnyCollection>>,
	/** No singletons, rather than any singleton - so that `reader.singleton()` only accepts configured names. */
	// oxlint-disable-next-line typescript/no-generated-empty-object-type
	const TSingletons extends Readonly<Record<string, AnySingleton>> = Record<never, AnySingleton>,
>(config: { collections: TCollections; singletons?: TSingletons }): Config<TCollections, TSingletons> {
	const { collections, singletons = {} as TSingletons } = config;

	const paths: Array<[name: string, path: string]> = [];

	for (const [name, item] of [...Object.entries(collections), ...Object.entries(singletons)]) {
		if (!pathPattern.test(item.path)) {
			throw new Error(`Path "${item.path}" of "${name}" must be a lowercase directory below "content/".`);
		}

		for (const [otherName, otherPath] of paths) {
			if (item.path === otherPath || item.path.startsWith(`${otherPath}/`) || otherPath.startsWith(`${item.path}/`)) {
				throw new Error(`Path "${item.path}" of "${name}" overlaps with path "${otherPath}" of "${otherName}".`);
			}
		}

		paths.push([name, item.path]);

		forEachField(item.fields, (field, fieldPath) => {
			if (isReferenceField(field)) {
				const target = field.collection;

				if (!Object.hasOwn(collections, target)) {
					throw new Error(`Field "${name}.${fieldPath}" references unknown collection "${target}".`);
				}
			}
		});
	}

	return { collections, singletons };
}

/**
 * Visits every field, including the fields nested in objects, arrays, blocks, and rich text blocks. The field path uses
 * `[]` for array items, and `<block>` for the fields of a block.
 */
export function forEachField(fields: Fields, visit: (field: Field, path: string) => void, prefix = ""): void {
	for (const [name, field] of Object.entries(fields)) {
		const path = prefix ? `${prefix}.${name}` : name;

		visitField(field, path, visit);
	}
}

function visitField(field: Field, path: string, visit: (field: Field, path: string) => void): void {
	visit(field, path);

	switch (field.kind) {
		case "object": {
			forEachField((field as ObjectField).fields, visit, path);
			break;
		}

		case "array": {
			visitField((field as ArrayField).item, `${path}[]`, visit);
			break;
		}

		case "blocks":
		case "richText": {
			for (const [type, block] of Object.entries((field as BlocksField | RichTextField).blocks)) {
				forEachField(block.fields, visit, `${path}<${type}>`);
			}
			break;
		}
	}
}
