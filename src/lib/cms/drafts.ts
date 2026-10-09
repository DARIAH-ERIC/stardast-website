import { Result } from "better-result";

import type { Config } from "#/src/lib/cms/schema/config.ts";
import {
	type Author,
	type ContentStorage,
	type Ref,
	type Revision,
	publishedRef,
} from "#/src/lib/cms/storage/types.ts";
import {
	EntryConflictError,
	EntryNotFoundError,
	type EntryTarget,
	type Expectation,
	type WriteError,
	type WriteResult,
	createWriter,
	resolveTarget,
} from "#/src/lib/cms/writer.ts";

/**
 * Drafts are refs - branches in the github storage - with one entry each, so that editors can work on changes to a
 * published entry without publishing them, and preview them. Publishing writes the entry to `main`, and deletes the
 * draft.
 */
export const draftRefPrefix = "cms/drafts/";

export function getDraftRef(target: EntryTarget): Ref {
	return target.kind === "collection"
		? `${draftRefPrefix}collections/${target.collection}/${target.id}`
		: `${draftRefPrefix}singletons/${target.singleton}`;
}

export function parseDraftRef(ref: Ref): EntryTarget | undefined {
	const segments = ref.startsWith(draftRefPrefix) ? ref.slice(draftRefPrefix.length).split("/") : [];

	if (segments[0] === "collections" && segments.length === 3) {
		return { kind: "collection", collection: segments[1]!, id: segments[2]! };
	}

	if (segments[0] === "singletons" && segments.length === 2) {
		return { kind: "singleton", singleton: segments[1]! };
	}

	return undefined;
}

export interface Draft {
	target: EntryTarget;
	ref: Ref;
	revision: Revision;
	/** The entry directory, e.g. `content/news/my-post`. */
	path: string;
}

export interface EntryVersions {
	published: { revision: Revision; data: unknown };
	draft?: { revision: Revision; data: unknown };
}

export interface Drafts {
	list: () => Promise<Array<Draft>>;
	/** The published version, and the draft if there is one. `data` is `undefined` for versions without the entry. */
	load: (target: EntryTarget) => Promise<EntryVersions>;
	/**
	 * Saves to the entry's draft, creating it if needed. `revision` is the revision the editor loaded: of the draft, or
	 * of the published content if there was no draft yet.
	 */
	save: (params: {
		target: EntryTarget;
		data: unknown;
		revision: Revision;
		author: Author;
	}) => Promise<Result<WriteResult, WriteError>>;
	/** Publishes `data` - usually the draft's, possibly with further changes - and deletes the draft. */
	publish: (params: {
		target: EntryTarget;
		data: unknown;
		revision: Revision;
		author: Author;
	}) => Promise<Result<WriteResult, WriteError>>;
	/** Deletes the draft, unless someone else changed it since `revision`. */
	discard: (params: { target: EntryTarget; revision: Revision }) => Promise<Result<void, WriteError>>;
	/** Deletes the published entry, and its draft. */
	remove: (params: {
		target: EntryTarget;
		revision: Revision;
		author: Author;
	}) => Promise<Result<WriteResult | undefined, WriteError>>;
}

const draftChangedError = (): EntryConflictError =>
	new EntryConflictError({
		message: "Someone else changed this draft in the meantime. Reload to see their changes.",
	});

export function createDrafts(params: { config: Config; storage: ContentStorage }): Drafts {
	const { config, storage } = params;

	const writer = createWriter({ config, storage });

	async function resolvePublished(): Promise<Revision> {
		const revision = await storage.resolve(publishedRef);

		if (revision == null) {
			throw new Error(`Ref "${publishedRef}" does not exist.`);
		}

		return revision;
	}

	/**
	 * The revision of the published content the editor's change is based on: where the draft branched off, or - without a
	 * draft - the revision the editor loaded.
	 */
	async function getPublishedBase(revision: Revision, draftHead: Revision | undefined): Promise<Revision> {
		if (draftHead == null) {
			return revision;
		}

		return (await storage.getMergeBase(await resolvePublished(), draftHead)) ?? (await resolvePublished());
	}

	return {
		async list() {
			const refs = await storage.listRefs(draftRefPrefix);
			const drafts: Array<Draft> = [];

			for (const { ref, revision } of refs) {
				const target = parseDraftRef(ref);
				const resolved = target != null ? resolveTarget(config, target) : undefined;

				/** Skips drafts of collections, or singletons, which were removed from the config. */
				if (target != null && resolved?.isOk() === true) {
					drafts.push({ target, ref, revision, path: resolved.value.path });
				}
			}

			return drafts;
		},

		async load(target) {
			const resolved = resolveTarget(config, target);

			if (resolved.isErr()) {
				throw resolved.error;
			}

			const { path } = resolved.value;
			const [published, draft] = await Promise.all([resolvePublished(), storage.resolve(getDraftRef(target))]);

			return {
				published: { revision: published, data: await storage.read(published, path) },
				draft: draft != null ? { revision: draft, data: await storage.read(draft, path) } : undefined,
			};
		},

		async save({ target, data, revision, author }) {
			const resolved = resolveTarget(config, target);

			if (resolved.isErr()) {
				return resolved;
			}

			const { path } = resolved.value;
			const ref = getDraftRef(target);
			let expect: Expectation = { type: "unchanged", since: revision };

			if ((await storage.resolve(ref)) == null) {
				const head = await resolvePublished();
				const [loaded, current] = await Promise.all([storage.read(revision, path), storage.read(head, path)]);

				/** Without a draft, the editor based their change on the published version - which must not have changed. */
				if (!Bun.deepEquals(loaded, current, true)) {
					return Result.err(
						new EntryConflictError({
							message: "Someone else published changes to this entry in the meantime. Reload to see them.",
						}),
					);
				}

				const created = await storage.createRef(ref, head);

				/** Someone else started a draft of this entry in the meantime. */
				if (created.isErr()) {
					return Result.err(draftChangedError());
				}

				expect = current === undefined ? { type: "absent" } : { type: "unchanged", since: head };
			}

			return writer.save({ ref, target, data, expect, author, verb: "Draft" });
		},

		async publish({ target, data, revision, author }) {
			const resolved = resolveTarget(config, target);

			if (resolved.isErr()) {
				return resolved;
			}

			const { path } = resolved.value;
			const ref = getDraftRef(target);
			const draftHead = await storage.resolve(ref);

			if (draftHead != null && draftHead !== revision) {
				return Result.err(draftChangedError());
			}

			const base = await getPublishedBase(revision, draftHead);
			const isPublished = (await storage.read(base, path)) !== undefined;

			const result = await writer.save({
				target,
				data,
				expect: isPublished ? { type: "unchanged", since: base } : { type: "absent" },
				author,
				verb: isPublished ? "Publish" : "Create",
			});

			if (result.isOk() && draftHead != null) {
				await storage.deleteRef(ref);
			}

			return result;
		},

		async discard({ target, revision }) {
			const ref = getDraftRef(target);
			const draftHead = await storage.resolve(ref);

			if (draftHead != null && draftHead !== revision) {
				return Result.err(draftChangedError());
			}

			await storage.deleteRef(ref);

			return Result.ok(undefined);
		},

		async remove({ target, revision, author }) {
			const resolved = resolveTarget(config, target);

			if (resolved.isErr()) {
				return resolved;
			}

			const ref = getDraftRef(target);
			const draftHead = await storage.resolve(ref);

			if (draftHead != null && draftHead !== revision) {
				return Result.err(draftChangedError());
			}

			const base = await getPublishedBase(revision, draftHead);
			let result: Result<WriteResult | undefined, WriteError> = Result.ok(undefined);

			/** An entry which only exists as a draft is removed by discarding the draft. */
			if ((await storage.read(base, resolved.value.path)) !== undefined) {
				result = await writer.remove({ target, since: base, author });
			} else if (draftHead == null) {
				return Result.err(new EntryNotFoundError({ message: "There is no entry with this id." }));
			}

			if (result.isOk() && draftHead != null) {
				await storage.deleteRef(ref);
			}

			return result;
		},
	};
}
