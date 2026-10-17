import type { APIRoute } from "astro";

import { env } from "#/configs/env.config.ts";
import { getAuthor } from "#/src/cms/api.ts";
import { getMedia } from "#/src/cms/media.ts";
import { handleRateLimits } from "#/src/lib/cms/http.ts";

/** Receives the file of an upload through the server, for asset storages without direct uploads. */
export const PUT: APIRoute = handleRateLimits(async (context) => {
	const length = Number(context.request.headers.get("content-length") ?? Number.NaN);

	/** Checked before reading the body, which would otherwise be buffered in full. */
	if (!Number.isInteger(length) || length > env.CMS_MAX_UPLOAD_SIZE * 1024 * 1024) {
		return Response.json({ message: "The file is too large." }, { status: 413 });
	}

	const result = await getMedia().receiveUpload({
		token: context.params.token ?? "",
		content: new Uint8Array(await context.request.arrayBuffer()),
		author: getAuthor(context.locals.session),
	});

	return result.isOk()
		? new Response(null, { status: 204 })
		: Response.json({ message: result.error.message }, { status: 422 });
});
