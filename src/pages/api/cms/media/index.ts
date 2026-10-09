import type { APIRoute } from "astro";
import * as v from "valibot";

import { getMediaOption } from "#/src/cms/admin.ts";
import { getAuthor, invalidate, parseBody, toErrorResponse } from "#/src/cms/api.ts";
import { getMedia } from "#/src/cms/media.ts";
import { handleRateLimits } from "#/src/lib/cms/http.ts";

const BodySchema = v.object({
	id: v.string(),
	key: v.string(),
	filename: v.pipe(v.string(), v.maxLength(200)),
	contentType: v.string(),
	width: v.optional(v.pipe(v.number(), v.minValue(1))),
	height: v.optional(v.pipe(v.number(), v.minValue(1))),
});

/** Completes an upload: creates the media entry for the uploaded file. Responds with the new media option. */
export const POST: APIRoute = handleRateLimits(async (context) => {
	const body = await parseBody(context.request, BodySchema);

	if ("response" in body) {
		return body.response;
	}

	const result = await getMedia().complete({ ...body.data, author: getAuthor(context.locals.session) });

	if (result.isErr()) {
		return result.error._tag === "MediaUploadError"
			? Response.json({ message: result.error.message }, { status: 422 })
			: toErrorResponse(result.error);
	}

	await invalidate(context, result.value);

	return Response.json(await getMediaOption(body.data.id, result.value.revision), { status: 201 });
});
