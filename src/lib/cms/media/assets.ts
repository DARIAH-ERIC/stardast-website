import type { CommitMessage } from "#/src/lib/cms/schema/config.ts";
import { type Author, type ContentStorage, publishedRef } from "#/src/lib/cms/storage/types.ts";

export type AssetStorageName = "repo" | "s3";

/**
 * Stores uploaded files. Media entries record which storage holds their file, so that files uploaded before switching
 * storages can still be served.
 */
export interface AssetStorage {
	readonly name: AssetStorageName;
	/** The key of a new file, unique per media entry. */
	createKey: (id: string, filename: string) => string;
	/**
	 * A url the browser can `PUT` the file to directly, e.g. a presigned s3 url - or `undefined`, to upload through the
	 * server with `put()`.
	 */
	createUploadUrl: (params: { key: string; contentType: string; expiresIn: number }) => Promise<string | undefined>;
	put: (params: { key: string; content: Uint8Array; contentType: string; author: Author }) => Promise<void>;
	stat: (key: string) => Promise<{ size: number } | undefined>;
	/** The file contents, for serving it - or `undefined` if there is no such file. */
	get: (key: string) => Promise<Blob | undefined>;
	delete: (key: string) => Promise<void>;
	/** Where imgproxy reads the original from. `publicUrl` is the file's url on the site, see `/media/[id]/[file]`. */
	getSourceUrl: (key: string, publicUrl: string) => string;
}

/**
 * Commits files to the content repository, next to their media entry's `index.json` - so they are versioned, and
 * deleted, together with the entry. Fine for a moderate number of images, but every file is part of every clone.
 */
export function createRepositoryAssetStorage(params: {
	storage: ContentStorage;
	path: string;
	commitMessage: CommitMessage;
}): AssetStorage {
	const { storage, path, commitMessage } = params;

	async function resolvePublished(): Promise<string> {
		const revision = await storage.resolve(publishedRef);

		if (revision == null) {
			throw new Error(`Ref "${publishedRef}" does not exist.`);
		}

		return revision;
	}

	return {
		name: "repo",

		createKey(id, filename) {
			return `${path}/${id}/${filename}`;
		},

		createUploadUrl() {
			return Promise.resolve(undefined);
		},

		async put({ key, content, author }) {
			const message = commitMessage({ action: "upload", label: key.slice(key.lastIndexOf("/") + 1) });
			const revision = await resolvePublished();
			const result = await storage.commit({
				ref: publishedRef,
				expectedRevision: revision,
				changes: [{ type: "put-file", path: key, content }],
				message,
				author,
			});

			/** A new path, so a conflict only means someone else committed in the meantime: try once more. */
			if (result.isErr()) {
				const retry = await storage.commit({
					ref: publishedRef,
					expectedRevision: await resolvePublished(),
					changes: [{ type: "put-file", path: key, content }],
					message,
					author,
				});

				retry.unwrap();
			}
		},

		async stat(key) {
			const content = await storage.readFile(await resolvePublished(), key);

			return content != null ? { size: content.byteLength } : undefined;
		},

		async get(key) {
			const content = await storage.readFile(await resolvePublished(), key);

			return content != null ? new Blob([content as Uint8Array<ArrayBuffer>]) : undefined;
		},

		delete() {
			/** Deleted together with the media entry's directory. */
			return Promise.resolve();
		},

		getSourceUrl(_key, publicUrl) {
			return publicUrl;
		},
	};
}

/**
 * Stores files in an s3-compatible object storage, e.g. ceph's rados gateway. Browsers upload directly, with presigned
 * urls - which requires a cors rule on the bucket allowing `PUT` with a `content-type` header from the site's origin.
 */
export function createS3AssetStorage(params: {
	client: Bun.S3Client;
	bucket: string;
	/** Prepended to all keys, e.g. `stardast/`. */
	prefix?: string;
}): AssetStorage {
	const { client, bucket, prefix = "" } = params;

	return {
		name: "s3",

		createKey(id, filename) {
			return `${prefix}media/${id}/${filename}`;
		},

		createUploadUrl({ key, contentType, expiresIn }) {
			return Promise.resolve(client.presign(key, { method: "PUT", type: contentType, expiresIn }));
		},

		async put({ key, content, contentType }) {
			await client.write(key, content, { type: contentType });
		},

		async stat(key) {
			if (!(await client.exists(key))) {
				return undefined;
			}

			const stat = await client.stat(key);

			return { size: stat.size };
		},

		async get(key) {
			const file = client.file(key);

			return (await file.exists()) ? file : undefined;
		},

		async delete(key) {
			await client.delete(key);
		},

		/** Imgproxy reads from the bucket directly - configure it with `IMGPROXY_USE_S3` and the endpoint. */
		getSourceUrl(key) {
			return `s3://${bucket}/${key}`;
		},
	};
}
