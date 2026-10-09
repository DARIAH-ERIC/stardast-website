import { mkdir, rm } from "node:fs/promises";
import * as path from "node:path";

import { Result } from "better-result";

import {
	ConflictError,
	type ContentStorage,
	type Ref,
	type Revision,
	publishedRef,
} from "#/src/lib/cms/storage/types.ts";

/** The working tree has no history, so `main` only ever has one revision. */
const workingTreeRevision: Revision = "working-tree";

const branchRevisionPrefix = "branch:";

/** Marks a directory below `.cms/refs/` as a branch, since branch names may contain slashes. */
const refMarker = ".ref";

/** Entry paths and ref names are built from url segments, so they must never escape their root directory. */
function resolveWithin(base: string, relative: string): string {
	const resolved = path.resolve(base, relative);

	if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
		throw new Error(`Path "${relative}" is outside of the content root.`);
	}

	return resolved;
}

async function listDirectory(directory: string): Promise<Array<string>> {
	const glob = new Bun.Glob("*/index.json");
	const names: Array<string> = [];

	try {
		for await (const match of glob.scan({ cwd: directory, onlyFiles: true })) {
			names.push(path.dirname(match));
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}

		throw error;
	}

	return names;
}

/**
 * Reads and writes the working tree of a local checkout, for development and tests. Has no history: reads always see
 * the current files, commits never conflict, and are applied change by change, so they are not atomic either.
 *
 * Other refs than `main` - e.g. drafts - are overlays in `.cms/refs/<ref>/`: they hold only the entries changed on that
 * ref, and read everything else from the working tree. Deleting entries on them is not supported.
 */
export function createFilesystemStorage(params: { root: string }): ContentStorage {
	const root = path.resolve(params.root);
	const refsRoot = path.join(root, ".cms", "refs");

	function getRefDirectory(ref: Ref): string {
		return resolveWithin(refsRoot, ref);
	}

	/** The directories a revision reads `entryPath` from, in order of precedence. */
	function getDirectories(revision: Revision, entryPath: string): Array<string> {
		const directory = resolveWithin(root, entryPath);

		if (!revision.startsWith(branchRevisionPrefix)) {
			return [directory];
		}

		const ref = revision.slice(branchRevisionPrefix.length);

		return [resolveWithin(getRefDirectory(ref), entryPath), directory];
	}

	async function refExists(ref: Ref): Promise<boolean> {
		return Bun.file(path.join(getRefDirectory(ref), refMarker)).exists();
	}

	return {
		name: "filesystem",

		async resolve(ref) {
			if (ref === publishedRef) {
				return workingTreeRevision;
			}

			return (await refExists(ref)) ? `${branchRevisionPrefix}${ref}` : undefined;
		},

		async read(revision, entryPath) {
			for (const directory of getDirectories(revision, entryPath)) {
				const file = Bun.file(path.join(directory, "index.json"));

				// oxlint-disable-next-line no-await-in-loop
				if (await file.exists()) {
					// oxlint-disable-next-line no-await-in-loop
					return (await file.json()) as unknown;
				}
			}

			return undefined;
		},

		async readFile(revision, filePath) {
			const directory = path.dirname(filePath);

			for (const base of getDirectories(revision, directory)) {
				const file = Bun.file(path.join(base, path.basename(filePath)));

				// oxlint-disable-next-line no-await-in-loop
				if (await file.exists()) {
					// oxlint-disable-next-line no-await-in-loop
					return new Uint8Array(await file.arrayBuffer());
				}
			}

			return undefined;
		},

		async list(revision, directory) {
			const names = await Promise.all(getDirectories(revision, directory).map((item) => listDirectory(item)));

			return [...new Set(names.flat())].toSorted();
		},

		async commit({ ref, changes }) {
			const base = ref === publishedRef ? root : getRefDirectory(ref);

			if (ref !== publishedRef && !(await refExists(ref))) {
				throw new Error(`Ref "${ref}" does not exist.`);
			}

			/** Sequentially, since changes are ordered - e.g. deleting an entry directory, then writing a file into it. */
			for (const change of changes) {
				switch (change.type) {
					case "put": {
						// oxlint-disable-next-line no-await-in-loop
						await Bun.write(
							path.join(resolveWithin(base, change.path), "index.json"),
							`${JSON.stringify(change.data, null, "\t")}\n`,
						);
						break;
					}

					case "put-file": {
						// oxlint-disable-next-line no-await-in-loop
						await Bun.write(resolveWithin(base, change.path), change.content);
						break;
					}

					case "delete": {
						if (ref !== publishedRef) {
							throw new Error("The filesystem storage does not support deleting entries on other refs than main.");
						}

						// oxlint-disable-next-line no-await-in-loop
						await rm(resolveWithin(base, change.path), { force: true, recursive: true });
						break;
					}
				}
			}

			return Result.ok(ref === publishedRef ? workingTreeRevision : `${branchRevisionPrefix}${ref}`);
		},

		async listRefs(prefix) {
			const glob = new Bun.Glob(`**/${refMarker}`);
			const refs: Array<{ ref: Ref; revision: Revision }> = [];

			try {
				for await (const match of glob.scan({ cwd: refsRoot, onlyFiles: true, dot: true })) {
					const ref = path.dirname(match).split(path.sep).join("/");

					if (ref.startsWith(prefix)) {
						refs.push({ ref, revision: `${branchRevisionPrefix}${ref}` });
					}
				}
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") {
					return [];
				}

				throw error;
			}

			return refs.toSorted((a, b) => a.ref.localeCompare(b.ref));
		},

		async createRef(ref, revision) {
			if (ref === publishedRef || (await refExists(ref))) {
				return Result.err(
					new ConflictError({ message: `Ref "${ref}" already exists.`, ref, expectedRevision: revision }),
				);
			}

			await mkdir(getRefDirectory(ref), { recursive: true });
			await Bun.write(path.join(getRefDirectory(ref), refMarker), "");

			return Result.ok(undefined);
		},

		async deleteRef(ref) {
			if (ref === publishedRef) {
				throw new Error(`Ref "${publishedRef}" cannot be deleted.`);
			}

			await rm(getRefDirectory(ref), { force: true, recursive: true });
		},

		getMergeBase() {
			/** Every overlay branches off the working tree. */
			return Promise.resolve(workingTreeRevision);
		},
	};
}
