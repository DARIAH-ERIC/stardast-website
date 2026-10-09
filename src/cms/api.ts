import type { APIContext, APIRoute } from "astro";
import * as v from "valibot";

import type { Session } from "#/src/cms/auth.ts";
import { config, mediaCollectionName } from "#/src/cms/config.ts";
import { getMedia } from "#/src/cms/media.ts";
import { refreshSearchIndex } from "#/src/cms/search.ts";
import { storage } from "#/src/cms/server.ts";
import { getInvalidationTags, invalidateWithRepeat } from "#/src/lib/cms/cache.ts";
import { createDrafts } from "#/src/lib/cms/drafts.ts";
import { handleRateLimits } from "#/src/lib/cms/http.ts";
import type { Author } from "#/src/lib/cms/storage/types.ts";
import type { EntryTarget, WriteError, WriteResult } from "#/src/lib/cms/writer.ts";

export const drafts = createDrafts({ config, storage });

export function getAuthor(session: Session | undefined): Author {
	if (session == null) {
		/** The middleware only lets signed-in users through. */
		throw new Error("Not signed in.");
	}

	return { name: session.identity.name, email: session.identity.email };
}

/** Parses a json request body, or returns a 400 response. */
export async function parseBody<TSchema extends v.GenericSchema>(
	request: Request,
	schema: TSchema,
): Promise<{ data: v.InferOutput<TSchema> } | { response: Response }> {
	const json: unknown = await request.json().catch(() => undefined);
	const result = v.safeParse(schema, json);

	if (!result.success) {
		return { response: Response.json({ message: "Invalid request body." }, { status: 400 }) };
	}

	return { data: result.output };
}

export function toErrorResponse(error: WriteError): Response {
	switch (error._tag) {
		case "EntryValidationError": {
			return Response.json({ message: error.message, issues: error.issues }, { status: 422 });
		}

		case "EntryNotFoundError": {
			return Response.json({ message: error.message }, { status: 404 });
		}

		case "EntryConflictError":
		case "EntryExistsError": {
			return Response.json({ message: error.message }, { status: 409 });
		}
	}
}

/**
 * Invalidates cached pages right away. With github storage, the push webhook would do so too, but only after a round
 * trip through github - and filesystem storage has no webhook at all.
 */
export async function invalidate(context: Pick<APIContext, "cache">, result: WriteResult): Promise<void> {
	refreshSearchIndex();

	if (!context.cache.enabled) {
		return;
	}

	await invalidateWithRepeat({
		invalidate: (tags) => context.cache.invalidate({ tags }),
		tags: getInvalidationTags(config, result.paths),
	});
}

const RevisionSchema = v.pipe(v.string(), v.nonEmpty());

const DataBodySchema = v.object({ data: v.unknown(), revision: RevisionSchema });

const RevisionBodySchema = v.object({ revision: RevisionSchema });

/**
 * Handlers for an entry - of a collection, or a singleton, as determined by `getTarget` from the route parameters. All
 * bodies include the `revision` the editor loaded, for conflict detection.
 */
export function createEntryRoutes(getTarget: (params: APIContext["params"]) => EntryTarget): {
	saveDraft: APIRoute;
	discardDraft: APIRoute;
	publish: APIRoute;
	remove: APIRoute;
} {
	return {
		saveDraft: handleRateLimits(async (context) => {
			const body = await parseBody(context.request, DataBodySchema);

			if ("response" in body) {
				return body.response;
			}

			const result = await drafts.save({
				target: getTarget(context.params),
				data: body.data.data,
				revision: body.data.revision,
				author: getAuthor(context.locals.session),
			});

			/** Drafts are not public, so there is nothing to invalidate. */
			return result.isOk() ? Response.json({ revision: result.value.revision }) : toErrorResponse(result.error);
		}),

		discardDraft: handleRateLimits(async (context) => {
			const body = await parseBody(context.request, RevisionBodySchema);

			if ("response" in body) {
				return body.response;
			}

			const result = await drafts.discard({ target: getTarget(context.params), revision: body.data.revision });

			return result.isOk() ? Response.json({}) : toErrorResponse(result.error);
		}),

		publish: handleRateLimits(async (context) => {
			const body = await parseBody(context.request, DataBodySchema);

			if ("response" in body) {
				return body.response;
			}

			const result = await drafts.publish({
				target: getTarget(context.params),
				data: body.data.data,
				revision: body.data.revision,
				author: getAuthor(context.locals.session),
			});

			if (result.isErr()) {
				return toErrorResponse(result.error);
			}

			await invalidate(context, result.value);

			return Response.json({ revision: result.value.revision });
		}),

		remove: handleRateLimits(async (context) => {
			const body = await parseBody(context.request, RevisionBodySchema);

			if ("response" in body) {
				return body.response;
			}

			const target = getTarget(context.params);
			const author = getAuthor(context.locals.session);

			/** Media is checked for usages, and its file deleted too. */
			const result =
				target.kind === "collection" && target.collection === mediaCollectionName
					? await getMedia().remove({ id: target.id, revision: body.data.revision, author })
					: await drafts.remove({ target, revision: body.data.revision, author });

			if (result.isErr()) {
				return result.error._tag === "MediaInUseError"
					? Response.json({ message: result.error.message, usages: result.error.usages }, { status: 409 })
					: toErrorResponse(result.error);
			}

			if (result.value != null) {
				await invalidate(context, result.value);
			}

			return Response.json({});
		}),
	};
}

export const collectionEntryRoutes = createEntryRoutes((params) => {
	return { kind: "collection", collection: params.collection ?? "", id: params.id ?? "" };
});

export const singletonRoutes = createEntryRoutes((params) => {
	return { kind: "singleton", singleton: params.singleton ?? "" };
});
