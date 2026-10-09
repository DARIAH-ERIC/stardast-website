import type { APIRoute } from "astro";
import * as v from "valibot";

import { parseBody } from "#/src/cms/api.ts";
import { getMedia } from "#/src/cms/media.ts";
import { handleRateLimits } from "#/src/lib/cms/http.ts";

const BodySchema = v.object({ filename: v.string(), contentType: v.string(), size: v.number() });

/** Starts an upload: responds with where to `PUT` the file - directly to s3, or to `./[token]`. */
export const POST: APIRoute = handleRateLimits(async (context) => {
	const body = await parseBody(context.request, BodySchema);

	if ("response" in body) {
		return body.response;
	}

	const result = await getMedia().createUpload(body.data);

	return result.isOk()
		? Response.json(result.value)
		: Response.json({ message: result.error.message }, { status: 422 });
});
