import { Result, TaggedError } from "better-result";
import * as v from "valibot";

import type { AnyCollection, AnySingleton, CommitAction, Config } from "#/src/lib/cms/schema/config.ts";
import { EntryIdSchema } from "#/src/lib/cms/schema/fields.ts";
import { editorMessagesLang } from "#/src/lib/cms/schema/messages.ts";
import {
	type Author,
	type Change,
	type ContentStorage,
	type Ref,
	type Revision,
	getChangedFilePath,
	publishedRef,
} from "#/src/lib/cms/storage/types.ts";

export interface ValidationIssue {
	/** Dot path into the entry data, e.g. `authors.0`, or `""` for the entry itself. */
	path: string;
	message: string;
}

export class EntryValidationError extends TaggedError("EntryValidationError")<{
	readonly message: string;
	readonly issues: ReadonlyArray<ValidationIssue>;
}> {}

export class EntryNotFoundError extends TaggedError("EntryNotFoundError")<{ readonly message: string }> {}

export class EntryExistsError extends TaggedError("EntryExistsError")<{ readonly message: string }> {}

/** Someone else changed or deleted the entry since the editor loaded it. */
export class EntryConflictError extends TaggedError("EntryConflictError")<{ readonly message: string }> {}

export type WriteError = EntryConflictError | EntryExistsError | EntryNotFoundError | EntryValidationError;

export interface WriteResult {
	revision: Revision;
	/** Changed file paths, e.g. to invalidate cached pages. */
	paths: Array<string>;
}

/** What is being written: an entry of a collection, or a singleton. */
export type EntryTarget =
	| { kind: "collection"; collection: string; id: string }
	| { kind: "singleton"; singleton: string };

/**
 * What the entry must look like before writing - for optimistic concurrency: absent, for new entries, or unchanged
 * since the revision the editor based their change on.
 */
export type Expectation = { type: "absent" } | { type: "unchanged"; since: Revision };

export interface ResolvedTarget {
	/** Entry directory, e.g. `content/news/my-post`. */
	path: string;
	descriptor: AnyCollection | AnySingleton;
	/** A short, human-readable name, e.g. for commit messages. */
	getLabel: (data: unknown) => string;
}

export function resolveTarget(config: Config, target: EntryTarget): Result<ResolvedTarget, EntryNotFoundError> {
	if (target.kind === "singleton") {
		const singleton = Object.hasOwn(config.singletons, target.singleton)
			? config.singletons[target.singleton]
			: undefined;

		if (singleton == null) {
			return Result.err(new EntryNotFoundError({ message: `Unknown singleton "${target.singleton}".` }));
		}

		return Result.ok({ path: singleton.path, descriptor: singleton, getLabel: () => singleton.label });
	}

	const collection = Object.hasOwn(config.collections, target.collection)
		? config.collections[target.collection]
		: undefined;

	if (collection == null) {
		return Result.err(new EntryNotFoundError({ message: `Unknown collection "${target.collection}".` }));
	}

	if (!v.is(EntryIdSchema, target.id)) {
		return Result.err(new EntryNotFoundError({ message: "There is no entry with this id." }));
	}

	const { id } = target;

	return Result.ok({
		path: `${collection.path}/${id}`,
		descriptor: collection,
		getLabel(data) {
			const value = (data as Record<string, unknown> | undefined)?.[collection.slug.from];

			return typeof value === "string" && value.trim() !== ""
				? `${target.collection} "${value}"`
				: `${target.collection} "${id}"`;
		},
	});
}

export function validate(schema: v.GenericSchema, data: unknown): Result<unknown, EntryValidationError> {
	const result = v.safeParse(schema, data, { lang: editorMessagesLang });

	if (result.success) {
		return Result.ok(result.output);
	}

	const issues = result.issues.map((issue) => {
		return { path: v.getDotPath(issue) ?? "", message: issue.message };
	});

	return Result.err(new EntryValidationError({ message: v.summarize(result.issues), issues }));
}

export interface Writer {
	/** Validates and writes an entry. `action` is passed to the config's `commitMessage`. */
	save: (params: {
		ref?: Ref;
		target: EntryTarget;
		data: unknown;
		expect: Expectation;
		author: Author;
		action: Exclude<CommitAction, "delete">;
	}) => Promise<Result<WriteResult, WriteError>>;
	remove: (params: {
		ref?: Ref;
		target: EntryTarget;
		/** The revision the editor last saw the entry at. */
		since: Revision;
		author: Author;
	}) => Promise<Result<WriteResult, WriteError>>;
}

/**
 * Validates and commits entries. Conflicts are detected per entry, not per repository: a write only fails if the entry
 * itself changed since the editor loaded it. Unrelated commits in the meantime - e.g. someone else editing another
 * entry - are handled by retrying on top of the new revision.
 */
export function createWriter(params: { config: Config; storage: ContentStorage; maxAttempts?: number }): Writer {
	const { config, storage, maxAttempts = 3 } = params;

	async function commit(params: {
		ref: Ref;
		path: string;
		expect: Expectation;
		changes: Array<Change>;
		message: string;
		author: Author;
	}): Promise<Result<WriteResult, WriteError>> {
		const { ref, path, expect, changes, message, author } = params;

		const base = expect.type === "unchanged" ? await storage.read(expect.since, path) : undefined;

		if (expect.type === "unchanged" && base === undefined) {
			return Result.err(new EntryNotFoundError({ message: "There is no entry with this id." }));
		}

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			// oxlint-disable-next-line no-await-in-loop
			const head = await storage.resolve(ref);

			if (head == null) {
				throw new Error(`Ref "${ref}" does not exist.`);
			}

			// oxlint-disable-next-line no-await-in-loop
			const current = await storage.read(head, path);

			if (expect.type === "absent" && current !== undefined) {
				return Result.err(new EntryExistsError({ message: "There already is an entry with this id." }));
			}

			if (expect.type === "unchanged" && !Bun.deepEquals(base, current, true)) {
				return Result.err(
					new EntryConflictError({
						message:
							current === undefined
								? "Someone else deleted this entry in the meantime."
								: "Someone else changed this entry in the meantime. Reload to see their changes.",
					}),
				);
			}

			// oxlint-disable-next-line no-await-in-loop
			const result = await storage.commit({ ref, expectedRevision: head, changes, message, author });

			if (result.isOk()) {
				return Result.ok({ revision: result.value, paths: changes.map((change) => getChangedFilePath(change)) });
			}

			/**
			 * The storage only fails with a `ConflictError`: the ref moved on between resolving and committing. Check the
			 * entry again, on top of the new head.
			 */
		}

		return Result.err(
			new EntryConflictError({ message: "The content is changing too quickly to save. Please try again." }),
		);
	}

	return {
		async save({ ref = publishedRef, target, data, expect, author, action }) {
			const resolved = resolveTarget(config, target);

			if (resolved.isErr()) {
				return resolved;
			}

			const { descriptor, path, getLabel } = resolved.value;

			/** Existing entries stay editable when the collection's id rules change. */
			if (target.kind === "collection" && descriptor.kind === "collection" && expect.type === "absent") {
				const id = validate(descriptor.idSchema, target.id);

				if (id.isErr()) {
					return id;
				}
			}

			const validated = validate(descriptor.schema, data);

			if (validated.isErr()) {
				return validated;
			}

			return commit({
				ref,
				path,
				expect,
				changes: [{ type: "put", path, data: validated.value }],
				message: config.commitMessage({ action, label: getLabel(validated.value) }),
				author,
			});
		},

		async remove({ ref = publishedRef, target, since, author }) {
			const resolved = resolveTarget(config, target);

			if (resolved.isErr()) {
				return resolved;
			}

			const { path, getLabel } = resolved.value;

			return commit({
				ref,
				path,
				expect: { type: "unchanged", since },
				changes: [{ type: "delete", path }],
				message: config.commitMessage({ action: "delete", label: getLabel(await storage.read(since, path)) }),
				author,
			});
		},
	};
}
