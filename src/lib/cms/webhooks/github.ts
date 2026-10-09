import { timingSafeEqual } from "node:crypto";

import * as v from "valibot";

import { cacheTags, getInvalidationTags, invalidateWithRepeat } from "#/src/lib/cms/cache.ts";
import type { Config } from "#/src/lib/cms/schema/config.ts";
import type { GitHubStorage } from "#/src/lib/cms/storage/github/storage.ts";
import { publishedRef } from "#/src/lib/cms/storage/types.ts";

/** @see {@link https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries} */
export async function verifySignature(params: {
	secret: string;
	body: string;
	signature: string | null;
}): Promise<boolean> {
	const { secret, body, signature } = params;

	if (signature?.startsWith("sha256=") !== true) {
		return false;
	}

	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
		"sign",
	]);
	const expected = Buffer.from(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
	const actual = Buffer.from(signature.slice("sha256=".length), "hex");

	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const zeroSha = /^0+$/;

const PushEventSchema = v.object({
	ref: v.string(),
	before: v.string(),
	after: v.string(),
});

export type PushEvent = v.InferOutput<typeof PushEventSchema>;

export function parsePushEvent(payload: unknown): PushEvent | undefined {
	const result = v.safeParse(PushEventSchema, payload);

	return result.success ? result.output : undefined;
}

/**
 * Handles a push to the published ref: records the new revision, then invalidates the pages which read changed content.
 * Changes are determined by comparing the trees of both revisions - unlike the file lists in the push payload, that is
 * also correct for force pushes, and for pushes with more commits than the payload includes.
 *
 * Invalidates a second time after `repeatAfter` milliseconds, see `invalidateWithRepeat()`.
 *
 * Returns the invalidated tags, or `undefined` if the push was not to the published ref.
 */
export async function handlePushEvent(params: {
	config: Config;
	storage: GitHubStorage;
	event: PushEvent;
	invalidate: (tags: Array<string>) => Promise<void>;
	repeatAfter?: number;
}): Promise<Array<string> | undefined> {
	const { config, storage, event, invalidate, repeatAfter = 10_000 } = params;

	if (event.ref !== `refs/heads/${publishedRef}` || zeroSha.test(event.after)) {
		return undefined;
	}

	let tags: Array<string>;

	if (zeroSha.test(event.before)) {
		tags = [cacheTags.all];
	} else {
		try {
			tags = getInvalidationTags(config, await storage.diff(event.before, event.after));
		} catch {
			tags = [cacheTags.all];
		}
	}

	storage.setRevision(publishedRef, event.after);

	await invalidateWithRepeat({ invalidate, tags, repeatAfter });

	return tags;
}
