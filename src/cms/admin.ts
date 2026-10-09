import * as v from "valibot";

import { type MediaEntryData, config, mediaCollectionName } from "#/src/cms/config.ts";
import { getImageUrl } from "#/src/cms/media.ts";
import { storage } from "#/src/cms/server.ts";
import type { Draft } from "#/src/lib/cms/drafts.ts";
import type { AnyCollection, AnySingleton, Config } from "#/src/lib/cms/schema/config.ts";
import { type Fields, isReferenceField } from "#/src/lib/cms/schema/fields.ts";
import { forEachField } from "#/src/lib/cms/schema/index.ts";
import { type Revision, publishedRef } from "#/src/lib/cms/storage/types.ts";

/**
 * Server-side helpers for the admin pages. These read raw, unvalidated data - unlike the reader - so that entries which
 * do not match the schema, e.g. after a manual edit or a schema change, can still be listed and fixed.
 */

/** Widened, since admin routes look up collections and singletons by url parameter. */
const { collections, singletons }: Config = config;

export interface EntrySummary {
	id: string;
	label: string;
	isValid: boolean;
	/** `published` without, `changed` with unpublished changes in a draft, `draft` if only a draft exists. */
	status: "changed" | "draft" | "published";
}

export interface ReferenceOption {
	id: string;
	label: string;
	/** For media: a small preview, for images. */
	thumbnailUrl?: string;
	contentType?: string;
}

export function getCollection(name: string | undefined): AnyCollection | undefined {
	return name != null && Object.hasOwn(collections, name) ? collections[name] : undefined;
}

export function getSingleton(name: string | undefined): AnySingleton | undefined {
	return name != null && Object.hasOwn(singletons, name) ? singletons[name] : undefined;
}

export async function getLatestRevision(): Promise<Revision> {
	const revision = await storage.resolve(publishedRef);

	if (revision == null) {
		throw new Error(`Ref "${publishedRef}" does not exist.`);
	}

	return revision;
}

export function getEntryLabel(collection: AnyCollection, id: string, data: unknown): string {
	const value = (data as Record<string, unknown> | undefined)?.[collection.slug.from];

	return typeof value === "string" && value.trim() !== "" ? value : id;
}

/** Published entries, and entries which only exist as drafts. Labels and validity are those of the latest version. */
export async function listEntrySummaries(
	name: string,
	collection: AnyCollection,
	revision: Revision,
	drafts: ReadonlyArray<Draft>,
): Promise<Array<EntrySummary>> {
	const ids = await storage.list(revision, collection.path);

	const draftRevisions = new Map<string, Revision>();

	for (const draft of drafts) {
		if (draft.target.kind === "collection" && draft.target.collection === name) {
			draftRevisions.set(draft.target.id, draft.revision);
		}
	}

	const published = new Set(ids);

	const summaries = await Promise.all(
		[...new Set([...ids, ...draftRevisions.keys()])].map(async (id) => {
			const draftRevision = draftRevisions.get(id);
			const data = await storage.read(draftRevision ?? revision, `${collection.path}/${id}`);
			const status = draftRevision == null ? "published" : published.has(id) ? "changed" : "draft";

			return {
				id,
				label: getEntryLabel(collection, id, data),
				isValid: v.is(collection.schema, data),
				status,
			} as const;
		}),
	);

	return summaries.toSorted((a, b) => a.label.localeCompare(b.label));
}

/** Options for every collection referenced by `fields`, including references nested in objects, arrays, and blocks. */
export async function loadReferenceOptions(
	fields: Fields,
	revision: Revision,
): Promise<Record<string, Array<ReferenceOption>>> {
	const names = new Set<string>();

	forEachField(fields, (field) => {
		if (isReferenceField(field)) {
			names.add(field.collection);
		}
	});

	const entries = await Promise.all(
		[...names].map(async (name) => {
			if (name === mediaCollectionName) {
				return [name, await listMediaOptions(revision)] as const;
			}

			const summaries = await listEntrySummaries(name, collections[name]!, revision, []);

			return [
				name,
				summaries.map(({ id, label }) => {
					return { id, label };
				}),
			] as const;
		}),
	);

	return Object.fromEntries(entries);
}

function toMediaOption(id: string, data: MediaEntryData): ReferenceOption {
	return {
		id,
		label: data.filename,
		contentType: data.contentType,
		thumbnailUrl: data.contentType.startsWith("image/")
			? getImageUrl(id, data, { width: 320, height: 320, resize: "fit" })
			: undefined,
	};
}

/** All media entries, as options for media pickers and the media library. */
export async function listMediaOptions(revision: Revision): Promise<Array<ReferenceOption>> {
	const { path } = collections[mediaCollectionName]!;
	const ids = await storage.list(revision, path);

	const options = await Promise.all(
		ids.map(async (id) => {
			const data = (await storage.read(revision, `${path}/${id}`)) as MediaEntryData | undefined;

			return data != null ? toMediaOption(id, data) : undefined;
		}),
	);

	return options.filter((option) => option != null).toSorted((a, b) => a.label.localeCompare(b.label));
}

export async function getMediaOption(id: string, revision: Revision): Promise<ReferenceOption | undefined> {
	const data = (await storage.read(revision, `${collections[mediaCollectionName]!.path}/${id}`)) as
		| MediaEntryData
		| undefined;

	return data != null ? toMediaOption(id, data) : undefined;
}
