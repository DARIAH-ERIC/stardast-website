import { Result, TaggedError } from "better-result";
import * as v from "valibot";

import type { SealedCodec } from "#/src/lib/cms/auth/sealed.ts";
import { type Drafts, getDraftRef } from "#/src/lib/cms/drafts.ts";
import type { AssetStorage, AssetStorageName } from "#/src/lib/cms/media/assets.ts";
import { type MediaContentType, isMediaContentType, mediaContentTypes } from "#/src/lib/cms/media/collection.ts";
import type { Config } from "#/src/lib/cms/schema/config.ts";
import type { Fields } from "#/src/lib/cms/schema/fields.ts";
import { collectReferences } from "#/src/lib/cms/schema/references.ts";
import { slugify } from "#/src/lib/cms/slug.ts";
import { type Author, type ContentStorage, type Revision, publishedRef } from "#/src/lib/cms/storage/types.ts";
import { type EntryTarget, type WriteError, type WriteResult, createWriter } from "#/src/lib/cms/writer.ts";

export class MediaUploadError extends TaggedError("MediaUploadError")<{ readonly message: string }> {}

export class MediaInUseError extends TaggedError("MediaInUseError")<{
	readonly message: string;
	readonly usages: ReadonlyArray<MediaUsage>;
}> {}

export interface MediaUsage {
	target: EntryTarget;
	/** Where in the entry the media is used, e.g. `image`, or `content<figure>[0].image`. */
	path: string;
	isDraft: boolean;
}

/** Sealed into the upload url for uploads through the server, so that it accepts exactly the announced file. */
export const UploadTokenSchema = v.object({ key: v.string(), contentType: v.string(), size: v.number() });

export type UploadToken = v.InferOutput<typeof UploadTokenSchema>;

export interface Upload {
	id: string;
	key: string;
	/** `PUT` the file here, with the given headers. */
	url: string;
	headers: Record<string, string>;
}

export interface MediaService {
	/** Validates an upload, and returns where to `PUT` the file. The media entry is created by `complete()`. */
	createUpload: (params: {
		filename: string;
		contentType: string;
		size: number;
	}) => Promise<Result<Upload, MediaUploadError>>;
	/** Stores a file uploaded through the server, i.e. when the asset storage has no direct upload urls. */
	receiveUpload: (params: {
		token: string;
		content: Uint8Array;
		author: Author;
	}) => Promise<Result<void, MediaUploadError>>;
	/** Creates the media entry for an uploaded file. */
	complete: (params: {
		id: string;
		key: string;
		filename: string;
		contentType: string;
		width?: number;
		height?: number;
		alt?: string;
		author: Author;
	}) => Promise<Result<WriteResult, MediaUploadError | WriteError>>;
	/** Entries which reference the media entry, in their published version or a draft. */
	findUsages: (id: string) => Promise<Array<MediaUsage>>;
	/** Deletes the media entry and its file - unless it is still used. */
	remove: (params: {
		id: string;
		revision: Revision;
		author: Author;
	}) => Promise<Result<WriteResult | undefined, MediaInUseError | WriteError>>;
}

function formatSize(bytes: number): string {
	return `${String(Math.round(bytes / 1024 / 1024))} mb`;
}

/** Ids are random, since many uploads share file names like `image.jpg` - but start with the name, to be readable. */
function createId(filename: string): string {
	const name = slugify(filename.replace(/\.[^.]*$/, ""))
		.slice(0, 40)
		.replace(/-+$/, "");
	const random = Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => (byte % 36).toString(36)).join("");

	return `${name === "" ? "file" : name}-${random}`;
}

function createFilename(filename: string, contentType: MediaContentType): string {
	const name = slugify(filename.replace(/\.[^.]*$/, ""))
		.slice(0, 80)
		.replace(/-+$/, "");

	return `${name === "" ? "file" : name}.${mediaContentTypes[contentType]}`;
}

export function createMediaService(params: {
	config: Config;
	storage: ContentStorage;
	drafts: Drafts;
	/** The name of the media collection in the config. */
	collection: string;
	/** All configured asset storages - including ones which only serve files uploaded before switching storages. */
	assets: Partial<Record<AssetStorageName, AssetStorage>>;
	/** Where new uploads go. */
	uploadTo: AssetStorageName;
	uploadTokens: SealedCodec<UploadToken>;
	/** In bytes. */
	maxSize: number;
}): MediaService {
	const { config, storage, drafts, collection, assets, uploadTo, uploadTokens, maxSize } = params;

	const writer = createWriter({ config, storage });
	const mediaCollection = config.collections[collection];

	if (mediaCollection == null) {
		throw new Error(`The media collection "${collection}" is not configured.`);
	}

	function getAssets(name: AssetStorageName): AssetStorage {
		const asset = assets[name];

		if (asset == null) {
			throw new Error(`The "${name}" asset storage is not configured.`);
		}

		return asset;
	}

	async function findUsages(id: string): Promise<Array<MediaUsage>> {
		const revision = await storage.resolve(publishedRef);

		if (revision == null) {
			throw new Error(`Ref "${publishedRef}" does not exist.`);
		}

		const draftList = await drafts.list();
		const usages: Array<MediaUsage> = [];

		const check = async (target: EntryTarget, fields: Fields, path: string): Promise<void> => {
			const draft = draftList.find((item) => getDraftRef(item.target) === getDraftRef(target));
			const versions = [
				{ isDraft: false, data: await storage.read(revision, path) },
				...(draft != null ? [{ isDraft: true, data: await storage.read(draft.revision, path) }] : []),
			];

			for (const { isDraft, data } of versions) {
				for (const reference of collectReferences(fields, data)) {
					if (reference.collection === collection && reference.id === id) {
						usages.push({ target, path: reference.path, isDraft });
					}
				}
			}
		};

		const checks: Array<Promise<void>> = [];

		const collections = Object.entries(config.collections).filter(([name]) => name !== collection);
		const ids = await Promise.all(collections.map(([, item]) => storage.list(revision, item.path)));

		collections.forEach(([name, item], index) => {
			const entryIds = new Set(ids[index]);

			for (const draft of draftList) {
				if (draft.target.kind === "collection" && draft.target.collection === name) {
					entryIds.add(draft.target.id);
				}
			}

			for (const entryId of entryIds) {
				checks.push(
					check({ kind: "collection", collection: name, id: entryId }, item.fields, `${item.path}/${entryId}`),
				);
			}
		});

		for (const [name, item] of Object.entries(config.singletons)) {
			checks.push(check({ kind: "singleton", singleton: name }, item.fields, item.path));
		}

		await Promise.all(checks);

		return usages;
	}

	return {
		async createUpload({ filename, contentType, size }) {
			if (!isMediaContentType(contentType)) {
				return Result.err(new MediaUploadError({ message: `Files of type "${contentType}" cannot be uploaded.` }));
			}

			if (!Number.isInteger(size) || size <= 0 || size > maxSize) {
				return Result.err(new MediaUploadError({ message: `Files must be smaller than ${formatSize(maxSize)}.` }));
			}

			const id = createId(filename);
			const target = getAssets(uploadTo);
			const key = target.createKey(id, createFilename(filename, contentType));
			const headers = { "content-type": contentType };

			const url =
				(await target.createUploadUrl({ key, contentType, expiresIn: 15 * 60 })) ??
				`/api/cms/media/uploads/${await uploadTokens.seal({ key, contentType, size }, { maxAge: 15 * 60 })}`;

			return Result.ok({ id, key, url, headers });
		},

		async receiveUpload({ token, content, author }) {
			const upload = await uploadTokens.unseal(token);

			if (upload == null) {
				return Result.err(new MediaUploadError({ message: "The upload has expired. Please try again." }));
			}

			if (content.byteLength !== upload.size) {
				return Result.err(new MediaUploadError({ message: "The file does not match the announced upload." }));
			}

			await getAssets(uploadTo).put({ key: upload.key, content, contentType: upload.contentType, author });

			return Result.ok(undefined);
		},

		async complete({ id, key, filename, contentType, width, height, alt = "", author }) {
			const target = getAssets(uploadTo);

			/** The key must be the one `createUpload()` derived for this id - so it cannot point at another file. */
			if (!isMediaContentType(contentType) || key !== target.createKey(id, key.slice(key.lastIndexOf("/") + 1))) {
				return Result.err(new MediaUploadError({ message: "The upload is invalid." }));
			}

			const stat = await target.stat(key);

			if (stat == null) {
				return Result.err(new MediaUploadError({ message: "The file was not uploaded. Please try again." }));
			}

			/** Presigned urls cannot limit the size, so it is checked afterwards. */
			if (stat.size > maxSize) {
				await target.delete(key);

				return Result.err(new MediaUploadError({ message: `Files must be smaller than ${formatSize(maxSize)}.` }));
			}

			return writer.save({
				target: { kind: "collection", collection, id },
				data: {
					alt,
					filename,
					contentType,
					size: stat.size,
					...(width != null ? { width: Math.round(width) } : {}),
					...(height != null ? { height: Math.round(height) } : {}),
					storage: target.name,
					key,
				},
				expect: { type: "absent" },
				author,
				verb: "Upload",
			});
		},

		findUsages,

		async remove({ id, revision, author }) {
			const usages = await findUsages(id);

			if (usages.length > 0) {
				return Result.err(new MediaInUseError({ message: "This file is still used, and cannot be deleted.", usages }));
			}

			const path = `${mediaCollection.path}/${id}`;
			const data = (await storage.read(revision, path)) as { storage?: AssetStorageName; key?: string } | undefined;
			const result = await drafts.remove({ target: { kind: "collection", collection, id }, revision, author });

			/** Files in the repository are deleted with the entry's directory - others separately, afterwards. */
			if (result.isOk() && data?.storage != null && data.key != null && data.storage !== "repo") {
				await getAssets(data.storage).delete(data.key);
			}

			return result;
		},
	};
}
