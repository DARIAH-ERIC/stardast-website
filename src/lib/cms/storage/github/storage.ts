import { Result } from "better-result";

import { createPromiseCache } from "#/src/lib/cms/lru.ts";
import { GitHubApiError, type GitHubClient } from "#/src/lib/cms/storage/github/client.ts";
import {
	type Author,
	ConflictError,
	type ContentStorage,
	type Ref,
	type Revision,
} from "#/src/lib/cms/storage/types.ts";

export interface GitHubStorage extends ContentStorage {
	/**
	 * Records the new revision of a ref, e.g. from a push webhook. Must be called before invalidating cached pages, so
	 * that re-rendered pages do not read the previous revision for up to `refTtl`.
	 */
	setRevision: (ref: Ref, revision: Revision) => void;
	/** Paths of all files which were added, changed, or removed between two revisions, sorted. */
	diff: (from: Revision, to: Revision) => Promise<Array<string>>;
}

interface Tree {
	sha: string;
	/** Maps file paths to blob shas. */
	files: Map<string, string>;
}

interface GitTreeResponse {
	sha: string;
	truncated: boolean;
	tree: Array<{ path: string; type: "blob" | "commit" | "tree"; sha: string }>;
}

interface GitRefResponse {
	object: { sha: string };
}

interface GitShaResponse {
	sha: string;
}

/**
 * Reading uses the singular `/git/ref/`, which only matches exactly. The plural `/git/refs/` falls back to matching by
 * prefix when there is no exact match, and then returns an array - e.g. for a deleted `drafts/a` when `drafts/a-2`
 * exists. Updating uses the plural.
 */
function refPath(ref: Ref, endpoint: "ref" | "refs"): string {
	return `/git/${endpoint}/heads/${ref
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/")}`;
}

/**
 * Github documents 409 and 422 for failed ref writes, but not which status - or message - it answers with when the ref
 * is not where the write expected it, and which when it refuses the write, e.g. because of branch protection, or a
 * ruleset. After such a failure, the ref is therefore read again: only a ref which has moved is a conflict, and a
 * refused write is thrown.
 *
 * @see {@link https://docs.github.com/en/rest/git/refs}
 */
function isRefWriteFailure(error: unknown): error is GitHubApiError {
	return GitHubApiError.is(error) && (error.status === 409 || error.status === 422);
}

/**
 * Reads content via the git data api, by revision: a revision's tree is fetched once, with all file paths and blob
 * shas, and blobs are cached by sha. A new revision therefore only costs one tree request, plus one request per changed
 * file - which keeps well within rate limits even when every page of the site is re-rendered.
 *
 * Commits are created as blobs, tree, and commit, followed by a fast-forward-only ref update, so that concurrent
 * commits conflict instead of overwriting each other.
 */
export function createGitHubStorage(params: {
	client: GitHubClient;
	/**
	 * Recorded as committer, while the editor is recorded as author. Github uses the author as committer when this is not
	 * set.
	 */
	committer?: Author;
	/**
	 * How long a resolved ref is reused, in milliseconds, before checking it again. Pushes are announced by webhook, so
	 * this only bounds how stale content can be when a webhook is missed. Checking an unchanged ref is a conditional
	 * request, which costs no rate limit.
	 */
	refTtl?: number;
	maxCachedTrees?: number;
	maxCachedBlobs?: number;
	now?: () => number;
}): GitHubStorage {
	const { client, committer, refTtl = 10_000, maxCachedTrees = 20, maxCachedBlobs = 5000, now = Date.now } = params;

	/** The etag of the last response for a ref, so that checking an unchanged ref again costs no rate limit. */
	interface RefState {
		revision: Revision | undefined;
		etag?: string;
	}

	const refs = new Map<Ref, { state: Promise<RefState>; expiresAt: number }>();
	const trees = createPromiseCache<Tree>({ max: maxCachedTrees });
	const blobs = createPromiseCache<string>({ max: maxCachedBlobs });

	function getTree(revision: Revision): Promise<Tree> {
		return trees.get(revision, async () => {
			const response = await client.request<GitTreeResponse>({
				path: `/git/trees/${encodeURIComponent(revision)}?recursive=1`,
			});

			if (response == null) {
				throw new Error(`Revision "${revision}" does not exist.`);
			}

			/** Only happens for trees with more than 100,000 entries, or 7 mb - far beyond a website's content. */
			if (response.truncated) {
				throw new Error(`Tree of revision "${revision}" is too large to be fetched at once.`);
			}

			const files = new Map<string, string>();

			for (const item of response.tree) {
				if (item.type === "blob") {
					files.set(item.path, item.sha);
				}
			}

			return { sha: response.sha, files };
		});
	}

	function getBlob(sha: string): Promise<string> {
		return blobs.get(sha, async () => {
			const text = await client.request<string>({ path: `/git/blobs/${sha}`, raw: true });

			if (text == null) {
				throw new Error(`Blob "${sha}" does not exist.`);
			}

			return text;
		});
	}

	/**
	 * Github may answer with the previous revision for a few seconds after a ref changed, e.g. right after deleting a
	 * draft. What this process wrote itself - or learned from a webhook - is therefore trusted for longer than `refTtl`.
	 */
	const knownRefTtl = Math.max(refTtl, 30_000);

	function setRevision(ref: Ref, revision: Revision): void {
		refs.set(ref, { state: Promise.resolve({ revision }), expiresAt: now() + knownRefTtl });
	}

	/** Reads a ref past the cache, which is dropped - e.g. after a failed write. */
	async function fetchRevision(ref: Ref): Promise<Revision | undefined> {
		refs.delete(ref);

		const response = await client.request<GitRefResponse>({ path: refPath(ref, "ref") });

		return response?.object.sha;
	}

	return {
		name: "github",

		setRevision,

		resolve(ref) {
			const cached = refs.get(ref);

			if (cached != null && cached.expiresAt > now()) {
				return cached.state.then((state) => state.revision);
			}

			const state = (async (): Promise<RefState> => {
				const previous = await cached?.state.catch(() => undefined);
				const response = await client.requestConditional<GitRefResponse>({
					path: refPath(ref, "ref"),
					etag: previous?.revision != null ? previous.etag : undefined,
				});

				switch (response.status) {
					case "not-modified": {
						return previous!;
					}

					case "not-found": {
						return { revision: undefined };
					}

					case "ok": {
						return { revision: response.data.object.sha, etag: response.etag };
					}
				}
			})();

			const entry = { state, expiresAt: now() + refTtl };

			refs.set(ref, entry);

			state.catch(() => {
				if (refs.get(ref) === entry) {
					refs.delete(ref);
				}
			});

			return state.then((state) => state.revision);
		},

		async read(revision, path) {
			const tree = await getTree(revision);
			const sha = tree.files.get(`${path}/index.json`);

			if (sha == null) {
				return undefined;
			}

			return JSON.parse(await getBlob(sha)) as unknown;
		},

		async readFile(revision, path) {
			const tree = await getTree(revision);
			const sha = tree.files.get(path);

			/** Not cached: binary files may be large, and are cached by http and imgproxy instead. */
			return sha != null ? client.request<Uint8Array>({ path: `/git/blobs/${sha}`, raw: "bytes" }) : undefined;
		},

		async list(revision, directory) {
			const tree = await getTree(revision);
			const prefix = `${directory}/`;
			const names: Array<string> = [];

			for (const path of tree.files.keys()) {
				if (!path.startsWith(prefix) || !path.endsWith("/index.json")) {
					continue;
				}

				const name = path.slice(prefix.length, -"/index.json".length);

				if (name !== "" && !name.includes("/")) {
					names.push(name);
				}
			}

			return names.toSorted();
		},

		async commit({ ref, expectedRevision, changes, message, author }) {
			if (changes.length === 0) {
				return Result.ok(expectedRevision);
			}

			const base = await getTree(expectedRevision);

			/** Keyed by path, so that a later change to the same file wins, e.g. a put after a delete of its entry. */
			const entries = new Map<
				string,
				{ path: string; mode: "100644"; type: "blob"; content?: string; sha?: string | null }
			>();

			for (const change of changes) {
				switch (change.type) {
					case "put": {
						const path = `${change.path}/index.json`;
						const content = `${JSON.stringify(change.data, null, "\t")}\n`;
						entries.set(path, { path, mode: "100644", type: "blob", content });
						break;
					}

					case "put-file": {
						/**
						 * The tree api only takes utf-8 content inline, so binary files are uploaded as blobs first - one by one,
						 * to keep memory bounded.
						 */
						// oxlint-disable-next-line no-await-in-loop
						const blob = await client.request<GitShaResponse>({
							method: "POST",
							path: "/git/blobs",
							body: { content: Buffer.from(change.content).toString("base64"), encoding: "base64" },
						});
						entries.set(change.path, { path: change.path, mode: "100644", type: "blob", sha: blob!.sha });
						break;
					}

					case "delete": {
						/** Deletes every file of the entry directory, e.g. also co-located assets. */
						for (const path of base.files.keys()) {
							if (path.startsWith(`${change.path}/`)) {
								entries.set(path, { path, mode: "100644", type: "blob", sha: null });
							}
						}
						break;
					}
				}
			}

			const tree = await client.request<GitShaResponse>({
				method: "POST",
				path: "/git/trees",
				body: { base_tree: base.sha, tree: [...entries.values()] },
			});

			const commit = await client.request<GitShaResponse>({
				method: "POST",
				path: "/git/commits",
				body: { message, tree: tree!.sha, parents: [expectedRevision], author, committer },
			});

			try {
				const updated = await client.request<GitRefResponse>({
					method: "PATCH",
					path: refPath(ref, "refs"),
					body: { sha: commit!.sha, force: false },
				});

				if (updated == null) {
					throw new Error(`Ref "${ref}" does not exist.`);
				}
			} catch (error) {
				/** E.g. "Update is not a fast forward": the ref has moved on since `expectedRevision`, or was deleted. */
				if (isRefWriteFailure(error) && (await fetchRevision(ref)) !== expectedRevision) {
					return Result.err(
						new ConflictError({
							message: `Ref "${ref}" has changed since revision "${expectedRevision}".`,
							ref,
							expectedRevision,
						}),
					);
				}

				throw error;
			}

			setRevision(ref, commit!.sha);

			return Result.ok(commit!.sha);
		},

		async listRefs(prefix) {
			/** Matches by prefix, unlike `/git/ref/`. Returns an empty array when nothing matches. */
			const response = await client.request<Array<{ ref: string; object: { sha: string } }>>({
				path: `/git/matching-refs/heads/${prefix
					.split("/")
					.map((segment) => encodeURIComponent(segment))
					.join("/")}`,
			});

			return (response ?? []).map((item) => {
				return { ref: item.ref.replace(/^refs\/heads\//, ""), revision: item.object.sha };
			});
		},

		async createRef(ref, revision) {
			try {
				await client.request({ method: "POST", path: "/git/refs", body: { ref: `refs/heads/${ref}`, sha: revision } });
			} catch (error) {
				/** E.g. "Reference already exists". */
				if (isRefWriteFailure(error) && (await fetchRevision(ref)) !== undefined) {
					return Result.err(
						new ConflictError({ message: `Ref "${ref}" already exists.`, ref, expectedRevision: revision }),
					);
				}

				throw error;
			}

			setRevision(ref, revision);

			return Result.ok(undefined);
		},

		async deleteRef(ref) {
			try {
				await client.request({ method: "DELETE", path: refPath(ref, "refs") });
			} catch (error) {
				/** E.g. "Reference does not exist". */
				if (!isRefWriteFailure(error) || (await fetchRevision(ref)) !== undefined) {
					throw error;
				}
			}

			refs.set(ref, { state: Promise.resolve({ revision: undefined }), expiresAt: now() + knownRefTtl });
		},

		async getMergeBase(a, b) {
			/** `per_page=1` keeps the response small - only the merge base is needed, not the commits in between. */
			const response = await client.request<{ merge_base_commit: { sha: string } }>({
				path: `/compare/${encodeURIComponent(a)}...${encodeURIComponent(b)}?per_page=1`,
			});

			return response?.merge_base_commit.sha;
		},

		async diff(from, to) {
			const [before, after] = await Promise.all([getTree(from), getTree(to)]);
			const paths = new Set<string>();

			for (const [path, sha] of before.files) {
				if (after.files.get(path) !== sha) {
					paths.add(path);
				}
			}

			for (const path of after.files.keys()) {
				if (!before.files.has(path)) {
					paths.add(path);
				}
			}

			return [...paths].toSorted();
		},
	};
}
