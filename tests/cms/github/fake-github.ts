import { createHash } from "node:crypto";

import type { Fetch } from "#/src/lib/cms/storage/github/client.ts";

interface Commit {
	tree: string;
	parents: Array<string>;
	message: string;
	author?: { name: string; email: string };
	committer?: { name: string; email: string };
}

export interface FakeGitHub {
	fetch: Fetch;
	/** Every request, as `METHOD /path`, relative to the repository. */
	requests: Array<string>;
	/** The response status of every request, in the same order as `requests`. */
	statuses: Array<number>;
	/** Commits files directly - `null` deletes - e.g. to simulate a push from outside the cms. Returns the commit sha. */
	push: (branch: string, files: Record<string, string | null>) => string;
	ref: (branch: string) => string | undefined;
	commit: (sha: string) => Commit | undefined;
	file: (branch: string, path: string) => string | undefined;
}

function json(body: unknown, status = 200): Response {
	return Response.json(body, { status });
}

function hash(value: unknown): string {
	return createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

/**
 * An in-memory stand-in for the parts of the github rest api which the github storage uses. Trees are kept flat - a map
 * of file paths to blob shas - which is all the storage observes of them.
 */
export function createFakeGitHub(params: { files: Record<string, string>; branch?: string }): FakeGitHub {
	const blobs = new Map<string, Uint8Array | string>();
	const trees = new Map<string, Map<string, string>>();
	const commits = new Map<string, Commit>();
	const refs = new Map<string, string>();
	const requests: Array<string> = [];
	const statuses: Array<number> = [];

	function createTree(files: Map<string, string>): string {
		const sha = hash([...files].toSorted(([a], [b]) => a.localeCompare(b)));
		trees.set(sha, files);
		return sha;
	}

	function createBlob(content: Uint8Array | string): string {
		const sha = hash(typeof content === "string" ? content : Buffer.from(content).toString("base64"));
		blobs.set(sha, content);
		return sha;
	}

	function createCommit(commit: Commit): string {
		const sha = hash(commit);
		commits.set(sha, commit);
		return sha;
	}

	function isAncestor(ancestor: string, sha: string): boolean {
		if (ancestor === sha) {
			return true;
		}

		return (commits.get(sha)?.parents ?? []).some((parent) => isAncestor(ancestor, parent));
	}

	const initialTree = createTree(
		new Map(Object.entries(params.files).map(([path, content]) => [path, createBlob(content)])),
	);
	refs.set(params.branch ?? "main", createCommit({ tree: initialTree, parents: [], message: "Initial commit" }));

	function push(branch: string, files: Record<string, string | null>): string {
		const parent = refs.get(branch)!;
		const tree = new Map(trees.get(commits.get(parent)!.tree));

		for (const [path, content] of Object.entries(files)) {
			if (content == null) {
				tree.delete(path);
			} else {
				tree.set(path, createBlob(content));
			}
		}

		const sha = createCommit({ tree: createTree(tree), parents: [parent], message: "Push" });
		refs.set(branch, sha);
		return sha;
	}

	function handle(url: URL, init?: RequestInit): Response {
		const method = init?.method ?? "GET";
		const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
		const path = url.pathname.replace(/^\/repos\/owner\/repo/, "");

		requests.push(`${method} ${path}`);

		const headers = new Headers(init?.headers);

		if (headers.get("authorization") == null) {
			return json({ message: "Requires authentication" }, 401);
		}

		let match: RegExpMatchArray | null;

		if ((match = /^\/git\/ref\/heads\/(?<ref>.+)$/.exec(path)) && method === "GET") {
			const sha = refs.get(decodeURIComponent(match.groups!.ref!));

			if (sha == null) {
				return json({ message: "Not Found" }, 404);
			}

			const etag = `"${sha}"`;

			if (headers.get("if-none-match") === etag) {
				return new Response(null, { status: 304, headers: { etag } });
			}

			return Response.json({ object: { sha } }, { headers: { etag } });
		}

		if ((match = /^\/git\/matching-refs\/heads\/(?<prefix>.*)$/.exec(path)) && method === "GET") {
			const prefix = decodeURIComponent(match.groups!.prefix!);

			return json(
				[...refs]
					.filter(([branch]) => branch.startsWith(prefix))
					.map(([branch, sha]) => {
						return { ref: `refs/heads/${branch}`, object: { sha } };
					}),
			);
		}

		if (path === "/git/refs" && method === "POST") {
			const branch = (body!.ref as string).replace(/^refs\/heads\//, "");

			if (refs.has(branch)) {
				return json({ message: "Reference already exists" }, 422);
			}

			refs.set(branch, body!.sha as string);
			return json({ ref: body!.ref, object: { sha: body!.sha } }, 201);
		}

		if ((match = /^\/git\/refs\/heads\/(?<ref>.+)$/.exec(path)) && method === "DELETE") {
			const branch = decodeURIComponent(match.groups!.ref!);

			if (!refs.delete(branch)) {
				return json({ message: "Reference does not exist" }, 422);
			}

			return new Response(null, { status: 204 });
		}

		if ((match = /^\/compare\/(?<base>[^.]+)\.\.\.(?<head>[^/]+)$/.exec(path)) && method === "GET") {
			const ancestors = new Set<string>();
			const collect = (sha: string): void => {
				ancestors.add(sha);
				commits.get(sha)?.parents.forEach(collect);
			};
			collect(match.groups!.base!);

			/** Breadth-first from `head`, so the first common ancestor found is the latest one. */
			const queue = [match.groups!.head!];

			while (queue.length > 0) {
				const sha = queue.shift()!;

				if (ancestors.has(sha)) {
					return json({ merge_base_commit: { sha } });
				}

				queue.push(...(commits.get(sha)?.parents ?? []));
			}

			return json({ message: "No common ancestor" }, 404);
		}

		if ((match = /^\/git\/refs\/heads\/(?<ref>.+)$/.exec(path)) && method === "PATCH") {
			const branch = decodeURIComponent(match.groups!.ref!);
			const current = refs.get(branch);
			const sha = body!.sha as string;

			if (current == null) {
				return json({ message: "Reference does not exist" }, 422);
			}

			if (body!.force !== true && !isAncestor(current, sha)) {
				return json({ message: "Update is not a fast forward" }, 422);
			}

			refs.set(branch, sha);
			return json({ object: { sha } });
		}

		if ((match = /^\/git\/trees\/(?<sha>[^/]+)$/.exec(path)) && method === "GET") {
			const sha = commits.get(match.groups!.sha!)?.tree ?? match.groups!.sha!;
			const tree = trees.get(sha);

			if (tree == null) {
				return json({ message: "Not Found" }, 404);
			}

			return json({
				sha,
				truncated: false,
				tree: [...tree].map(([path, sha]) => {
					return { path, type: "blob", sha };
				}),
			});
		}

		if ((match = /^\/git\/blobs\/(?<sha>[^/]+)$/.exec(path)) && method === "GET") {
			const blob = blobs.get(match.groups!.sha!);
			return blob != null ? new Response(blob as BodyInit) : json({ message: "Not Found" }, 404);
		}

		if (path === "/git/blobs" && method === "POST") {
			if (body!.encoding !== "base64") {
				return json({ message: "Unsupported encoding" }, 422);
			}

			return json({ sha: createBlob(Buffer.from(body!.content as string, "base64")) }, 201);
		}

		if (path === "/git/trees" && method === "POST") {
			const tree = new Map(trees.get(body!.base_tree as string));

			for (const entry of body!.tree as Array<{ path: string; content?: string; sha?: string | null }>) {
				if (entry.sha === null) {
					tree.delete(entry.path);
				} else if (entry.sha != null) {
					tree.set(entry.path, entry.sha);
				} else {
					tree.set(entry.path, createBlob(entry.content!));
				}
			}

			return json({ sha: createTree(tree) }, 201);
		}

		if (path === "/git/commits" && method === "POST") {
			return json({ sha: createCommit(body as unknown as Commit) }, 201);
		}

		return json({ message: `Unhandled ${method} ${path}` }, 500);
	}

	return {
		fetch(url, init) {
			const response = handle(url, init);
			statuses.push(response.status);
			return Promise.resolve(response);
		},
		requests,
		statuses,
		push,
		ref(branch) {
			return refs.get(branch);
		},
		commit(sha) {
			return commits.get(sha);
		},
		file(branch, path) {
			const sha = trees.get(commits.get(refs.get(branch)!)!.tree)!.get(path);
			const blob = sha != null ? blobs.get(sha) : undefined;
			return typeof blob === "string" || blob == null ? blob : Buffer.from(blob).toString("binary");
		},
	};
}
