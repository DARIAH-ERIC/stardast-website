import { createHmac } from "node:crypto";

import type { ImageLoader, ImageOptions } from "#/src/lib/cms/media/images.ts";

export interface Imgproxy {
	getUrl: (source: string, options: ImageOptions) => string;
	/** The signature of a path, including its leading `/` - or `insecure`, without key and salt. */
	sign: (path: string) => string;
}

/**
 * Builds imgproxy urls. With a key and salt, urls are signed, so that only the server can request new image variants -
 * otherwise anyone could make imgproxy process arbitrary sizes.
 *
 * @see {@link https://docs.imgproxy.net/usage/signing_url}
 */
export function createImgproxy(params: { baseUrl: string; key?: string; salt?: string }): Imgproxy {
	const { baseUrl, key, salt } = params;

	const secret =
		key != null && salt != null ? { key: Buffer.from(key, "hex"), salt: Buffer.from(salt, "hex") } : undefined;

	function sign(path: string): string {
		if (secret == null) {
			return "insecure";
		}

		return createHmac("sha256", secret.key).update(secret.salt).update(path).digest("base64url");
	}

	return {
		sign,

		getUrl(source, options) {
			const { width = 0, height = 0, resize = "fit", format, quality } = options;

			const processing = [`rs:${resize}:${String(width)}:${String(height)}`];

			if (quality != null) {
				processing.push(`q:${String(quality)}`);
			}

			/** Base64-encoded, so that the source needs no escaping. */
			const path = `/${processing.join("/")}/${Buffer.from(source).toString("base64url")}${format != null ? `.${format}` : ""}`;

			return `${baseUrl.replace(/\/+$/, "")}/${sign(path)}${path}`;
		},
	};
}

/** Hands images to imgproxy, which reads originals from their source url, e.g. directly from an s3 bucket. */
export function createImgproxyLoader(imgproxy: Imgproxy): ImageLoader {
	return {
		getUrl(image, options) {
			return imgproxy.getUrl(image.source, options);
		},
	};
}
