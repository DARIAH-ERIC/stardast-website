import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { createDrafts, getDraftRef, parseDraftRef } from "#/src/lib/cms/drafts.ts";
import { createReader } from "#/src/lib/cms/reader.ts";
import { collection, defineConfig, fields } from "#/src/lib/cms/schema/index.ts";
import { createFilesystemStorage } from "#/src/lib/cms/storage/filesystem.ts";
import { createGitHubClient, createStaticTokenProvider } from "#/src/lib/cms/storage/github/client.ts";
import { createGitHubStorage } from "#/src/lib/cms/storage/github/storage.ts";
import { EntryConflictError, EntryExistsError, EntryNotFoundError } from "#/src/lib/cms/writer.ts";
import { createFakeGitHub } from "#/tests/cms/github/fake-github.ts";
import { getRejection } from "#/tests/helpers.ts";

const config = defineConfig({
	collections: {
		news: collection({
			label: "News",
			path: "content/news",
			slug: { from: "title" },
			fields: { title: fields.text({ label: "Title" }) },
		}),
	},
});

const author = { name: "Jane Doe", email: "jane@example.org" };
const a = { kind: "collection", collection: "news", id: "a" } as const;
const b = { kind: "collection", collection: "news", id: "b" } as const;
const draftOfA = "cms/drafts/collections/news/a";

function setup() {
	const github = createFakeGitHub({ files: { "content/news/a/index.json": JSON.stringify({ title: "A" }) } });
	const client = createGitHubClient({
		repository: "owner/repo",
		auth: createStaticTokenProvider("t"),
		fetch: github.fetch,
	});
	const storage = createGitHubStorage({ client, refTtl: 0 });
	const drafts = createDrafts({ config, storage });

	const file = (ref: string, entry: string) => {
		const content = github.file(ref, `content/news/${entry}/index.json`);
		return content != null ? (JSON.parse(content) as unknown) : undefined;
	};

	return { github, storage, drafts, file };
}

test("draft refs round-trip", () => {
	expect(getDraftRef(a)).toBe(draftOfA);
	expect(parseDraftRef(draftOfA)).toEqual(a);
	expect(parseDraftRef(getDraftRef({ kind: "singleton", singleton: "settings" }))).toEqual({
		kind: "singleton",
		singleton: "settings",
	});
	expect(parseDraftRef("cms/drafts/collections/news")).toBeUndefined();
	expect(parseDraftRef("main")).toBeUndefined();
});

describe("drafts", () => {
	test("saving creates a draft, and leaves the published version alone", async () => {
		const { github, drafts, file } = setup();
		const published = (await drafts.load(a)).published.revision;

		const saved = (await drafts.save({ target: a, data: { title: "A2" }, revision: published, author })).unwrap();

		expect(github.ref(draftOfA)).toBe(saved.revision);
		expect(github.commit(saved.revision)).toMatchObject({ message: 'content: draft news "A2"', author });
		expect(file("main", "a")).toEqual({ title: "A" });
		expect(file(draftOfA, "a")).toEqual({ title: "A2" });
		expect(await drafts.load(a)).toEqual({
			published: { revision: published, data: { title: "A" } },
			draft: { revision: saved.revision, data: { title: "A2" } },
		});
		expect((await drafts.list()).map((draft) => draft.path)).toEqual(["content/news/a"]);
	});

	test("saving again updates the draft, unless someone else saved in the meantime", async () => {
		const { drafts, file } = setup();
		const published = (await drafts.load(a)).published.revision;
		const first = (await drafts.save({ target: a, data: { title: "A2" }, revision: published, author })).unwrap();

		const second = await drafts.save({ target: a, data: { title: "A3" }, revision: first.revision, author });
		expect(second.isOk()).toBe(true);
		expect(file(draftOfA, "a")).toEqual({ title: "A3" });

		/** Based on the first save, which the second one changed. */
		const stale = await drafts.save({ target: a, data: { title: "A4" }, revision: first.revision, author });
		expect(stale.isErr() && EntryConflictError.is(stale.error)).toBe(true);
		expect(file(draftOfA, "a")).toEqual({ title: "A3" });
	});

	test("starting a draft fails if the published version changed since loading", async () => {
		const { github, drafts } = setup();
		const published = (await drafts.load(a)).published.revision;
		github.push("main", { "content/news/a/index.json": JSON.stringify({ title: "Changed" }) });

		const result = await drafts.save({ target: a, data: { title: "A2" }, revision: published, author });

		expect(result.isErr() && EntryConflictError.is(result.error)).toBe(true);
		expect(github.ref(draftOfA)).toBeUndefined();
	});

	test("publishing writes to main, and deletes the draft - also after unrelated publishes", async () => {
		const { github, drafts, file } = setup();
		const published = (await drafts.load(a)).published.revision;
		const draft = (await drafts.save({ target: a, data: { title: "A2" }, revision: published, author })).unwrap();
		github.push("main", { "content/news/other/index.json": JSON.stringify({ title: "Other" }) });

		const result = await drafts.publish({ target: a, data: { title: "A3" }, revision: draft.revision, author });

		expect(result.isOk()).toBe(true);
		expect(file("main", "a")).toEqual({ title: "A3" });
		expect(file("main", "other")).toEqual({ title: "Other" });
		expect(github.commit(github.ref("main")!)).toMatchObject({ message: 'content: publish news "A3"' });
		expect(github.ref(draftOfA)).toBeUndefined();
	});

	test("publishing fails if the published version changed since the draft was started", async () => {
		const { github, drafts, file } = setup();
		const published = (await drafts.load(a)).published.revision;
		const draft = (await drafts.save({ target: a, data: { title: "A2" }, revision: published, author })).unwrap();
		github.push("main", { "content/news/a/index.json": JSON.stringify({ title: "Changed" }) });

		const result = await drafts.publish({ target: a, data: { title: "A2" }, revision: draft.revision, author });

		expect(result.isErr() && EntryConflictError.is(result.error)).toBe(true);
		expect(file("main", "a")).toEqual({ title: "Changed" });
		expect(github.ref(draftOfA)).toBe(draft.revision);
	});

	test("publishing without a draft saves directly", async () => {
		const { github, drafts, file } = setup();
		const published = (await drafts.load(a)).published.revision;

		const result = await drafts.publish({ target: a, data: { title: "A2" }, revision: published, author });

		expect(result.isOk()).toBe(true);
		expect(file("main", "a")).toEqual({ title: "A2" });
		expect(github.ref(draftOfA)).toBeUndefined();
	});

	test("new entries can be drafted, and published", async () => {
		const { drafts, file } = setup();
		const published = (await drafts.load(b)).published.revision;

		const draft = (await drafts.save({ target: b, data: { title: "B" }, revision: published, author })).unwrap();
		expect(file("main", "b")).toBeUndefined();
		expect((await drafts.load(b)).published.data).toBeUndefined();

		const result = await drafts.publish({ target: b, data: { title: "B" }, revision: draft.revision, author });
		expect(result.isOk()).toBe(true);
		expect(file("main", "b")).toEqual({ title: "B" });
	});

	test("new entries fail if someone else created one with the same id in the meantime", async () => {
		const { github, drafts } = setup();
		/** The editor opens "new entry" ... */
		const loaded = (await drafts.load(b)).published.revision;
		/** ... while someone else publishes "b". */
		github.push("main", { "content/news/b/index.json": JSON.stringify({ title: "Taken" }) });

		const draft = await drafts.save({ target: b, data: { title: "B" }, revision: loaded, author });
		const published = await drafts.publish({ target: b, data: { title: "B" }, revision: loaded, author });

		expect(draft.isErr() && EntryConflictError.is(draft.error)).toBe(true);
		expect(published.isErr() && EntryExistsError.is(published.error)).toBe(true);
	});

	test("discarding deletes the draft, unless someone else changed it", async () => {
		const { github, drafts } = setup();
		const published = (await drafts.load(a)).published.revision;
		const first = (await drafts.save({ target: a, data: { title: "A2" }, revision: published, author })).unwrap();
		const second = (await drafts.save({ target: a, data: { title: "A3" }, revision: first.revision, author })).unwrap();

		const stale = await drafts.discard({ target: a, revision: first.revision });
		expect(stale.isErr()).toBe(true);
		expect(github.ref(draftOfA)).toBe(second.revision);

		expect((await drafts.discard({ target: a, revision: second.revision })).isOk()).toBe(true);
		expect(github.ref(draftOfA)).toBeUndefined();
	});

	test("review requests are kept in the draft, while it is saved again, until withdrawn", async () => {
		const { github, drafts } = setup();
		const now = new Date("2026-10-19T12:00:00Z");
		const published = (await drafts.load(a)).published.revision;
		const draft = (await drafts.save({ target: a, data: { title: "A2" }, revision: published, author })).unwrap();

		const requested = (await drafts.requestReview({ target: a, revision: draft.revision, author, now })).unwrap();

		const reviewRequest = { requestedBy: author, requestedAt: "2026-10-19T12:00:00.000Z" };
		expect(github.commit(requested)).toMatchObject({ message: 'content: request-review news "A2"', author });
		expect((await drafts.load(a)).draft).toEqual({ revision: requested, data: { title: "A2" }, reviewRequest });
		expect(github.file("main", ".cms/review/index.json")).toBeUndefined();

		const saved = (await drafts.save({ target: a, data: { title: "A3" }, revision: requested, author })).unwrap();
		expect(await drafts.getReviewRequest(saved.revision)).toEqual(reviewRequest);

		const withdrawn = (await drafts.withdrawReview({ target: a, revision: saved.revision, author })).unwrap();
		expect(await drafts.getReviewRequest(withdrawn)).toBeUndefined();
		expect((await drafts.load(a)).draft?.data).toEqual({ title: "A3" });

		/** Withdrawing again changes nothing. */
		expect((await drafts.withdrawReview({ target: a, revision: withdrawn, author })).unwrap()).toBe(withdrawn);
		expect(github.ref(draftOfA)).toBe(withdrawn);
	});

	test("review requests need an unchanged draft, and go away with it when published", async () => {
		const { github, drafts, file } = setup();
		const published = (await drafts.load(a)).published.revision;

		const missing = await drafts.requestReview({ target: a, revision: published, author });
		expect(missing.isErr() && EntryNotFoundError.is(missing.error)).toBe(true);

		const first = (await drafts.save({ target: a, data: { title: "A2" }, revision: published, author })).unwrap();
		const second = (await drafts.save({ target: a, data: { title: "A3" }, revision: first.revision, author })).unwrap();

		const stale = await drafts.requestReview({ target: a, revision: first.revision, author });
		expect(stale.isErr() && EntryConflictError.is(stale.error)).toBe(true);

		const requested = (await drafts.requestReview({ target: a, revision: second.revision, author })).unwrap();
		expect((await drafts.publish({ target: a, data: { title: "A3" }, revision: requested, author })).isOk()).toBe(true);

		expect(github.ref(draftOfA)).toBeUndefined();
		expect(file("main", "a")).toEqual({ title: "A3" });
		expect(github.file("main", ".cms/review/index.json")).toBeUndefined();
	});

	test("removing deletes the published entry and its draft, or just a draft", async () => {
		const { github, drafts, file } = setup();
		const published = (await drafts.load(a)).published.revision;
		const draft = (await drafts.save({ target: a, data: { title: "A2" }, revision: published, author })).unwrap();

		expect((await drafts.remove({ target: a, revision: draft.revision, author })).isOk()).toBe(true);
		expect(file("main", "a")).toBeUndefined();
		expect(github.ref(draftOfA)).toBeUndefined();

		const main = (await drafts.load(b)).published.revision;
		const draftOfB = (await drafts.save({ target: b, data: { title: "B" }, revision: main, author })).unwrap();
		const commits = github.ref("main");

		expect((await drafts.remove({ target: b, revision: draftOfB.revision, author })).isOk()).toBe(true);
		expect(github.ref("cms/drafts/collections/news/b")).toBeUndefined();
		/** Nothing to delete on main. */
		expect(github.ref("main")).toBe(commits);
	});

	test("previews read drafts instead of published entries, including new ones", async () => {
		const { storage, drafts } = setup();
		const published = (await drafts.load(a)).published.revision;
		await drafts.save({ target: a, data: { title: "A2" }, revision: published, author });
		await drafts.save({ target: b, data: { title: "B" }, revision: published, author });

		const list = await drafts.list();
		const preview = createReader({
			config,
			storage,
			overlays: list.map(({ path, revision }) => {
				return { path, revision };
			}),
		});
		const reader = createReader({ config, storage });

		expect((await preview.list("news")).map((entry) => entry.data.title)).toEqual(["A2", "B"]);
		expect((await reader.list("news")).map((entry) => entry.data.title)).toEqual(["A"]);
		expect(await preview.entry("news", "b")).toMatchObject({ data: { title: "B" } });
		expect(await reader.entry("news", "b")).toBeUndefined();
	});
});

describe("drafts with filesystem storage", () => {
	let root: string | undefined;

	afterEach(async () => {
		if (root != null) {
			await rm(root, { force: true, recursive: true });
		}
	});

	test("saves, previews, publishes, and discards", async () => {
		root = await mkdtemp(path.join(tmpdir(), "cms-drafts-"));
		await Bun.write(path.join(root, "content/news/a/index.json"), JSON.stringify({ title: "A" }));

		const storage = createFilesystemStorage({ root });
		const drafts = createDrafts({ config, storage });
		const read = async (entry: string) =>
			Bun.file(path.join(root!, `content/news/${entry}/index.json`)).json() as Promise<unknown>;

		const published = (await drafts.load(a)).published.revision;
		const draft = (await drafts.save({ target: a, data: { title: "A2" }, revision: published, author })).unwrap();
		const newDraft = (await drafts.save({ target: b, data: { title: "B" }, revision: published, author })).unwrap();

		expect(await read("a")).toEqual({ title: "A" });
		expect((await drafts.list()).map((item) => item.ref)).toEqual([
			"cms/drafts/collections/news/a",
			"cms/drafts/collections/news/b",
		]);

		const preview = createReader({
			config,
			storage,
			overlays: (await drafts.list()).map(({ path, revision }) => {
				return { path, revision };
			}),
		});
		expect((await preview.list("news")).map((entry) => entry.data.title)).toEqual(["A2", "B"]);

		expect((await drafts.publish({ target: a, data: { title: "A2" }, revision: draft.revision, author })).isOk()).toBe(
			true,
		);
		expect(await read("a")).toEqual({ title: "A2" });

		expect((await drafts.discard({ target: b, revision: newDraft.revision })).isOk()).toBe(true);
		expect(await drafts.list()).toEqual([]);
		expect(await Bun.file(path.join(root, "content/news/b/index.json")).exists()).toBe(false);
	});

	test("requests, and withdraws, reviews", async () => {
		root = await mkdtemp(path.join(tmpdir(), "cms-drafts-"));
		await Bun.write(path.join(root, "content/news/a/index.json"), JSON.stringify({ title: "A" }));

		const storage = createFilesystemStorage({ root });
		const drafts = createDrafts({ config, storage });

		const published = (await drafts.load(a)).published.revision;
		const draft = (await drafts.save({ target: a, data: { title: "A2" }, revision: published, author })).unwrap();

		const requested = (await drafts.requestReview({ target: a, revision: draft.revision, author })).unwrap();
		expect((await drafts.getReviewRequest(requested))?.requestedBy).toEqual(author);

		const withdrawn = (await drafts.withdrawReview({ target: a, revision: requested, author })).unwrap();
		expect(await drafts.getReviewRequest(withdrawn)).toBeUndefined();
		expect((await drafts.load(a)).draft?.data).toEqual({ title: "A2" });

		/** Entries of main still cannot be deleted on a draft. */
		const rejection = await getRejection(
			storage.commit({
				ref: getDraftRef(a),
				expectedRevision: withdrawn,
				changes: [{ type: "delete", path: "content/news/a" }],
				message: "Delete a",
				author,
			}),
		);
		expect(String(rejection)).toContain("does not support deleting entries of main");
	});
});
