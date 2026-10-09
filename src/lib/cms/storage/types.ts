import { type Result, TaggedError } from "better-result";

/**
 * A named, movable pointer to a revision - a git branch in the github adapter. `main` holds published content, drafts
 * live on their own refs.
 */
export type Ref = string;

/**
 * Opaque identifier of an immutable snapshot of the content - a commit sha in the github adapter. Reads are addressed
 * by revision, so that all reads of a request see the same snapshot, and so that adapters can cache reads forever.
 */
export type Revision = string;

export const publishedRef: Ref = "main";

export interface Author {
	name: string;
	email: string;
}

/** Paths are entry directories relative to the repository root, e.g. `content/news/my-post`. */
/**
 * `put` and `delete` take entry directories, e.g. `content/news/my-post`. `put-file` takes a file path within an entry
 * directory, e.g. `content/media/photo-a1b2c3/photo.jpg`, for binary files like uploaded images.
 */
export type Change =
	| { type: "delete"; path: string }
	| { type: "put"; path: string; data: unknown }
	| { type: "put-file"; path: string; content: Uint8Array };

/** The file paths a change touches, e.g. to invalidate cached pages. */
export function getChangedFilePath(change: Change): string {
	return change.type === "put-file" ? change.path : `${change.path}/index.json`;
}

export class ConflictError extends TaggedError("ConflictError")<{
	readonly message: string;
	readonly ref: Ref;
	readonly expectedRevision: Revision;
}> {}

/**
 * Persists entries as json documents, in a directory per entry. Knows nothing about collections or schemas - parsing
 * and validating is the reader's job - so that adapters only deal with storing and versioning.
 */
export interface ContentStorage {
	readonly name: string;
	/** Resolves a ref to the revision it currently points to, or `undefined` if the ref does not exist. */
	resolve: (ref: Ref) => Promise<Revision | undefined>;
	/** Reads the `index.json` of an entry directory, or `undefined` if there is none. */
	read: (revision: Revision, path: string) => Promise<unknown>;
	/** Reads any file, e.g. an uploaded image, or `undefined` if there is none. */
	readFile: (revision: Revision, path: string) => Promise<Uint8Array | undefined>;
	/** Lists the names of the subdirectories of `path` which contain an `index.json`, sorted. */
	list: (revision: Revision, path: string) => Promise<Array<string>>;
	/**
	 * Applies all changes atomically, as a new revision on top of `expectedRevision`. Fails with a `ConflictError` if the
	 * ref has moved on in the meantime, e.g. because someone else published.
	 */
	commit: (params: {
		ref: Ref;
		expectedRevision: Revision;
		changes: ReadonlyArray<Change>;
		message: string;
		author: Author;
	}) => Promise<Result<Revision, ConflictError>>;
	/** Refs starting with `prefix`, e.g. all drafts. */
	listRefs: (prefix: string) => Promise<Array<{ ref: Ref; revision: Revision }>>;
	/** Creates a ref pointing to `revision`. Fails with a `ConflictError` if the ref already exists. */
	createRef: (ref: Ref, revision: Revision) => Promise<Result<void, ConflictError>>;
	/** Deletes a ref - the revisions it pointed to stay in the history. Does nothing if the ref does not exist. */
	deleteRef: (ref: Ref) => Promise<void>;
	/**
	 * The latest revision both `a` and `b` descend from, e.g. where a draft branched off from the published content - or
	 * `undefined` if they have no common history.
	 */
	getMergeBase: (a: Revision, b: Revision) => Promise<Revision | undefined>;
}
