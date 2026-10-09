import type { APIRoute } from "astro";
import * as v from "valibot";

import { type MediaEntryData, config } from "#/src/cms/config.ts";
import { assets, imageTransformConfig, imageTransformer } from "#/src/cms/media.ts";
import { storage } from "#/src/cms/server.ts";
import { isRasterImage } from "#/src/lib/cms/media/collection.ts";
import { parseImageRequest } from "#/src/lib/cms/media/transform.ts";
import { EntryIdSchema } from "#/src/lib/cms/schema/index.ts";
import { publishedRef } from "#/src/lib/cms/storage/types.ts";

/**
 * Serves uploaded files - and resized and converted variants of raster images, requested with query parameters, see
 * `createTransformLoader()`. Ids are never reused, and files never replaced, so responses can be cached forever - by
 * browsers, a cdn, and imgproxy. Originals are not cached by the server itself, which would keep whole files in memory,
 * variants are, see `createImageTransformer()`.
 */
export const GET: APIRoute = async (context) => {
	const { id = "", file = "" } = context.params;

	if (!v.is(EntryIdSchema, id)) {
		return new Response(null, { status: 404 });
	}

	const request = parseImageRequest(context.url.searchParams, imageTransformConfig);

	if (request.isErr()) {
		return Response.json({ message: request.error.message }, { status: 400 });
	}

	const revision = await storage.resolve(publishedRef);
	const data = (await storage.read(revision!, `${config.collections.media.path}/${id}`)) as MediaEntryData | undefined;

	if (data == null || data.key.slice(data.key.lastIndexOf("/") + 1) !== file) {
		return new Response(null, { status: 404 });
	}

	const asset = assets[data.storage];
	const headers = {
		"cache-control": "public, max-age=31536000, immutable",
		"x-content-type-options": "nosniff",
	};

	if (request.value != null) {
		if (imageTransformer == null || !isRasterImage(data.contentType)) {
			return Response.json({ message: "This file has no variants." }, { status: 400 });
		}

		const variant = await imageTransformer.get(`${id}/${file}`, request.value, async () => {
			const blob = await asset?.get(data.key);

			return blob != null ? new Uint8Array(await blob.arrayBuffer()) : undefined;
		});

		if (variant == null) {
			return new Response(null, { status: 404 });
		}

		return new Response(variant.body, { headers: { ...headers, "content-type": variant.contentType } });
	}

	const blob = await asset?.get(data.key);

	if (blob == null) {
		return new Response(null, { status: 404 });
	}

	return new Response(blob, {
		headers: {
			...headers,
			"content-type": data.contentType,
			/** Svgs can contain scripts, which must not run with the site's origin. */
			...(data.contentType === "image/svg+xml"
				? { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" }
				: {}),
		},
	});
};
