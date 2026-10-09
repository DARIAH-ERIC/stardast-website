import * as v from "valibot";

import { editorMessagesLang } from "#/src/lib/cms/schema/messages.ts";

export type Path = ReadonlyArray<number | string>;

/** The same format as `v.getDotPath()`, e.g. `authors.0`. */
export function toDotPath(path: Path): string {
	return path.join(".");
}

/** Returns a copy of `target` with the value at `path` replaced - creating objects along the way as needed. */
export function setIn(target: unknown, path: Path, value: unknown): unknown {
	if (path.length === 0) {
		return value;
	}

	const [key, ...rest] = path as [number | string, ...Array<number | string>];

	if (Array.isArray(target)) {
		const copy = [...(target as Array<unknown>)];
		copy[key as number] = setIn(copy[key as number], rest, value);
		return copy;
	}

	const object = target != null && typeof target === "object" ? (target as Record<string, unknown>) : {};
	const next = setIn(object[key], rest, value);
	const copy = { ...object };

	if (next === undefined) {
		/** Optional fields are omitted rather than stored as `undefined`, matching what the server stores. */
		// oxlint-disable-next-line typescript/no-dynamic-delete
		delete copy[key];
	} else {
		copy[key] = next;
	}

	return copy;
}

/**
 * Returns a copy of `items` with the item at `from` moved to before the item at `before`, or to the end for
 * `items.length` - i.e. `before` is an insertion point, as when dropping between items.
 */
export function moveItem<T>(items: ReadonlyArray<T>, from: number, before: number): Array<T> {
	const next = [...items];
	const [item] = next.splice(from, 1);
	next.splice(before > from ? before - 1 : before, 0, item as T);

	return next;
}

export type IssuesByPath = ReadonlyMap<string, ReadonlyArray<string>>;

export function groupIssues(issues: ReadonlyArray<{ path: string; message: string }>): IssuesByPath {
	const grouped = new Map<string, Array<string>>();

	for (const issue of issues) {
		const messages = grouped.get(issue.path) ?? [];
		messages.push(issue.message);
		grouped.set(issue.path, messages);
	}

	return grouped;
}

export function validate(schema: v.GenericSchema, data: unknown): Array<{ path: string; message: string }> {
	const result = v.safeParse(schema, data, { lang: editorMessagesLang });

	return result.success
		? []
		: result.issues.map((issue) => {
				return { path: v.getDotPath(issue) ?? "", message: issue.message };
			});
}

/** Messages for `path` and everything below it - e.g. for rich text, whose nested nodes have no field of their own. */
export function getNestedIssues(issues: IssuesByPath, path: string): Array<string> {
	const messages: Array<string> = [];

	for (const [key, value] of issues) {
		if (key === path || key.startsWith(`${path}.`)) {
			messages.push(...value);
		}
	}

	return messages;
}
