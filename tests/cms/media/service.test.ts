import { describe, expect, test } from "bun:test";

import { createSealedCodec } from "#/src/lib/cms/auth/sealed.ts";
import { createDrafts } from "#/src/lib/cms/drafts.ts";
import { createRepositoryAssetStorage } from "#/src/lib/cms/media/assets.ts";
import { createMediaCollection } from "#/src/lib/cms/media/collection.ts";
import {
	MediaInUseError,
	MediaUploadError,
	UploadTokenSchema,
	createMediaService,
} from "#/src/lib/cms/media/service.ts";
import { block, collection, defineConfig, fields, optional } from "#/src/lib/cms/schema/index.ts";
import { createGitHubClient, createStaticTokenProvider } from "#/src/lib/cms/storage/github/client.ts";
import { createGitHubStorage } from "#/src/lib/cms/storage/github/storage.ts";
import { createFakeGitHub } from "#/tests/cms/github/fake-github.ts";

const config = defineConfig({
	collections: {
		media: createMediaCollection(),
		news: collection({
			label: "News",
			path: "content/news",
			slug: { from: "title" },
			fields: {
				title: fields.text({ label: "Title" }),
				image: optional(fields.image({ label: "Image" })),
				content: fields.richText({
					label: "Content",
					blocks: { figure: block({ label: "Figure", fields: { image: fields.image({ label: "Image" }) } }) },
				}),
			},
		}),
	},
});

const author = { name: "Jane Doe", email: "jane@example.org" };
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function setup() {
	const github = createFakeGitHub({ files: {} });
	const client = createGitHubClient({
		repository: "owner/repo",
		auth: createStaticTokenProvider("t"),
		fetch: github.fetch,
	});
	const storage = createGitHubStorage({ client, refTtl: 0 });
	const drafts = createDrafts({ config, storage });
	const media = createMediaService({
		config,
		storage,
		drafts,
		collection: "media",
		assets: { repo: createRepositoryAssetStorage({ storage, path: "content/media" }) },
		uploadTo: "repo",
		uploadTokens: createSealedCodec({ secret: "s".repeat(32), purpose: "upload", schema: UploadTokenSchema }),
		maxSize: 1024,
	});

	return { github, storage, drafts, media };
}

async function upload(media: ReturnType<typeof setup>["media"], filename = "Team Photo 2026.PNG") {
	const created = (await media.createUpload({ filename, contentType: "image/png", size: png.byteLength })).unwrap();
	const token = created.url.slice("/api/cms/media/uploads/".length);

	(await media.receiveUpload({ token, content: png, author })).unwrap();

	const completed = await media.complete({
		id: created.id,
		key: created.key,
		filename,
		contentType: "image/png",
		width: 800.4,
		height: 600,
		author,
	});

	return { created, completed };
}

describe("media", () => {
	test("uploads through the server into the repository, next to the media entry", async () => {
		const { github, media } = setup();

		const { created, completed } = await upload(media);

		expect(created.id).toMatch(/^team-photo-2026-[a-z0-9]{6}$/);
		expect(created.key).toBe(`content/media/${created.id}/team-photo-2026.png`);
		expect(created.url).toStartWith("/api/cms/media/uploads/");
		expect(completed.isOk()).toBe(true);
		expect(github.file("main", created.key)).toBe(Buffer.from(png).toString("binary"));
		expect(JSON.parse(github.file("main", `content/media/${created.id}/index.json`)!)).toEqual({
			alt: "",
			filename: "Team Photo 2026.PNG",
			contentType: "image/png",
			size: 8,
			width: 800,
			height: 600,
			storage: "repo",
			key: created.key,
		});
	});

	test("rejects unsupported types, and files which are too large", async () => {
		const { media } = setup();

		const type = await media.createUpload({ filename: "a.exe", contentType: "application/x-msdownload", size: 1 });
		const size = await media.createUpload({ filename: "a.png", contentType: "image/png", size: 1025 });

		expect(type.isErr() && MediaUploadError.is(type.error)).toBe(true);
		expect(size.isErr() && MediaUploadError.is(size.error)).toBe(true);
	});

	test("only accepts the announced file, for the announced key", async () => {
		const { media } = setup();
		const created = (await media.createUpload({ filename: "a.png", contentType: "image/png", size: 8 })).unwrap();
		const token = created.url.slice("/api/cms/media/uploads/".length);

		expect((await media.receiveUpload({ token, content: new Uint8Array(9), author })).isErr()).toBe(true);
		expect((await media.receiveUpload({ token: "forged", content: png, author })).isErr()).toBe(true);

		/** Not uploaded yet. */
		const early = await media.complete({
			id: created.id,
			key: created.key,
			filename: "a.png",
			contentType: "image/png",
			author,
		});
		expect(early.isErr() && MediaUploadError.is(early.error)).toBe(true);

		/** A key which belongs to another entry. */
		const other = await media.complete({
			id: created.id,
			key: "content/news/a/index.json",
			filename: "a.png",
			contentType: "image/png",
			author,
		});
		expect(other.isErr() && MediaUploadError.is(other.error)).toBe(true);
	});

	test("finds usages in fields, rich text blocks, and drafts - and refuses to delete used media", async () => {
		const { storage, drafts, media } = setup();
		const { created } = await upload(media);
		const id = created.id;
		const revision = (await storage.resolve("main"))!;

		await drafts.publish({
			target: { kind: "collection", collection: "news", id: "a" },
			data: { title: "A", image: id, content: { type: "doc", content: [] } },
			revision,
			author,
		});
		await drafts.save({
			target: { kind: "collection", collection: "news", id: "b" },
			data: { title: "B", content: { type: "doc", content: [{ type: "figure", attrs: { image: id } }] } },
			revision: (await storage.resolve("main"))!,
			author,
		});

		expect(await media.findUsages(id)).toEqual([
			{ target: { kind: "collection", collection: "news", id: "a" }, path: "image", isDraft: false },
			{ target: { kind: "collection", collection: "news", id: "b" }, path: "content<figure>[0].image", isDraft: true },
		]);

		const removed = await media.remove({ id, revision: (await storage.resolve("main"))!, author });
		expect(removed.isErr() && MediaInUseError.is(removed.error)).toBe(true);
	});

	test("deletes unused media, together with the file", async () => {
		const { github, storage, media } = setup();
		const { created } = await upload(media);

		const removed = await media.remove({ id: created.id, revision: (await storage.resolve("main"))!, author });

		expect(removed.isOk()).toBe(true);
		expect(github.file("main", created.key)).toBeUndefined();
		expect(github.file("main", `content/media/${created.id}/index.json`)).toBeUndefined();
	});
});
