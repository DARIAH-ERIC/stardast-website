import { Result, TaggedError } from "better-result";

import type { ImageLoader, ImageOptions } from "#/src/lib/cms/media/images.ts";

const formats = ["avif", "jpg", "png", "webp"] as const;

const resizeModes = ["fill", "fit"] as const;

export interface ImageTransformConfig {
	/**
	 * The only widths, and heights, which can be requested - like next.js's `deviceSizes`. Anyone can request variants,
	 * and the server has to compute each one, so this bounds the number of variants per image.
	 */
	sizes: ReadonlyArray<number>;
	/** The only qualities which can be requested. Without a quality, the format's default is used. */
	qualities?: ReadonlyArray<number>;
}

/** Always with a width and a format, so that each variant has exactly one url. */
export interface ImageVariantOptions extends ImageOptions {
	width: number;
	format: (typeof formats)[number];
	resize: (typeof resizeModes)[number];
}

export class ImageRequestError extends TaggedError("ImageRequestError")<{ readonly message: string }> {}

function includes<T>(values: ReadonlyArray<T>, value: unknown): value is T {
	return values.includes(value as T);
}

function validate(options: ImageOptions, config: ImageTransformConfig): Result<ImageVariantOptions, ImageRequestError> {
	const { width, height, resize = "fit", format = "webp", quality } = options;
	const { sizes, qualities = [] } = config;

	if (width == null || !sizes.includes(width)) {
		return Result.err(new ImageRequestError({ message: `The width must be one of ${sizes.join(", ")}.` }));
	}

	if (height != null && !sizes.includes(height)) {
		return Result.err(new ImageRequestError({ message: `The height must be one of ${sizes.join(", ")}.` }));
	}

	if (!includes(resizeModes, resize)) {
		return Result.err(new ImageRequestError({ message: `The resize mode must be one of ${resizeModes.join(", ")}.` }));
	}

	if (!includes(formats, format)) {
		return Result.err(new ImageRequestError({ message: `The format must be one of ${formats.join(", ")}.` }));
	}

	if (quality != null && !qualities.includes(quality)) {
		return Result.err(
			new ImageRequestError({
				message:
					qualities.length > 0 ? `The quality must be one of ${qualities.join(", ")}.` : "The quality cannot be set.",
			}),
		);
	}

	return Result.ok({
		width,
		format,
		resize,
		...(height != null ? { height } : {}),
		...(quality != null ? { quality } : {}),
	});
}

/** In a fixed order, without defaults - so that equal options give equal urls, and cache keys. */
function toSearchParams(options: ImageVariantOptions): URLSearchParams {
	const params = new URLSearchParams({ w: String(options.width) });

	if (options.height != null) {
		params.set("h", String(options.height));
	}

	if (options.resize !== "fit") {
		params.set("fit", options.resize);
	}

	params.set("f", options.format);

	if (options.quality != null) {
		params.set("q", String(options.quality));
	}

	return params;
}

/**
 * Requests variants from the route which serves the original, with query parameters, see `parseImageRequest()`. Throws
 * for options which the route would reject, e.g. a width which is not in `config.sizes`.
 */
export function createTransformLoader(config: ImageTransformConfig): ImageLoader {
	return {
		getUrl(image, options) {
			const result = validate(options, config);

			if (result.isErr()) {
				throw new Error(`Invalid variant of image "${image.url}": ${result.error.message}`);
			}

			return `${image.url}?${toSearchParams(result.value).toString()}`;
		},
	};
}

/** The query parameters of variants, e.g. for cache keys. */
export const variantParams = ["w", "h", "fit", "f", "q"] as const;

function parseInteger(value: string | null): number | undefined {
	return value != null && /^\d{1,5}$/.test(value) ? Number(value) : undefined;
}

/**
 * Parses the query parameters of `createTransformLoader()` urls. `undefined` requests the original - so do unrelated
 * parameters, e.g. `utm_source`.
 */
export function parseImageRequest(
	params: URLSearchParams,
	config: ImageTransformConfig,
): Result<ImageVariantOptions | undefined, ImageRequestError> {
	if (!variantParams.some((name) => params.has(name))) {
		return Result.ok(undefined);
	}

	const width = parseInteger(params.get("w"));
	const height = parseInteger(params.get("h"));
	const quality = parseInteger(params.get("q"));

	if (width == null || (params.has("h") && height == null) || (params.has("q") && quality == null)) {
		return Result.err(new ImageRequestError({ message: "Sizes and qualities must be integers." }));
	}

	return validate(
		{
			width,
			...(height != null ? { height } : {}),
			...(quality != null ? { quality } : {}),
			resize: (params.get("fit") ?? "fit") as ImageVariantOptions["resize"],
			format: (params.get("f") ?? "webp") as ImageVariantOptions["format"],
		},
		config,
	);
}

export interface ImageVariant {
	body: Uint8Array<ArrayBuffer>;
	contentType: string;
}

export type TransformImage = (input: Uint8Array, options: ImageVariantOptions) => Promise<ImageVariant>;

/** Animated gifs and webps stay animated as webps. Other formats would get all frames, one below the other. */
const animatedFormats = new Set<string>(["webp"]);

export async function transformWithSharp(input: Uint8Array, options: ImageVariantOptions): Promise<ImageVariant> {
	/** Loaded on first use, so that sites which use imgproxy never load sharp's native binaries. */
	const { default: sharp } = await import("sharp");

	const format = options.format === "jpg" ? "jpeg" : options.format;

	const output = await sharp(input, { animated: animatedFormats.has(format), autoOrient: true })
		.resize({
			width: options.width,
			height: options.height,
			fit: options.resize === "fill" ? "cover" : "inside",
			withoutEnlargement: true,
		})
		.toFormat(format, options.quality != null ? { quality: options.quality } : {})
		.toBuffer();

	return { body: new Uint8Array(output), contentType: `image/${format}` };
}

function createLimit(concurrency: number): <T>(task: () => Promise<T>) => Promise<T> {
	let active = 0;
	const queue: Array<() => void> = [];

	return async (task) => {
		if (active >= concurrency) {
			await new Promise<void>((resolve) => {
				queue.push(resolve);
			});
		}

		active += 1;

		try {
			return await task();
		} finally {
			active -= 1;
			queue.shift()?.();
		}
	};
}

export interface ImageTransformer {
	/** `load` reads the original, and is only called when the variant is neither cached nor being computed. */
	get: (
		key: string,
		options: ImageVariantOptions,
		load: () => Promise<Uint8Array | undefined>,
	) => Promise<ImageVariant | undefined>;
}

/**
 * Computes variants, and keeps the most recently used ones in memory, up to `maxCacheSize` bytes. Concurrent requests
 * for the same variant share one computation, and at most `concurrency` variants are computed at the same time, so that
 * a page with many new images does not starve other requests.
 */
export function createImageTransformer(params: {
	maxCacheSize: number;
	concurrency: number;
	transform?: TransformImage;
}): ImageTransformer {
	const { maxCacheSize, concurrency, transform = transformWithSharp } = params;

	const cache = new Map<string, ImageVariant>();
	let cacheSize = 0;
	const pending = new Map<string, Promise<ImageVariant | undefined>>();
	const limit = createLimit(concurrency);

	function remember(key: string, variant: ImageVariant): void {
		if (variant.body.byteLength > maxCacheSize) {
			return;
		}

		cache.set(key, variant);
		cacheSize += variant.body.byteLength;

		for (const [oldestKey, oldest] of cache) {
			if (cacheSize <= maxCacheSize) {
				break;
			}

			cache.delete(oldestKey);
			cacheSize -= oldest.body.byteLength;
		}
	}

	return {
		get(key, options, load) {
			const variantKey = `${key}?${toSearchParams(options).toString()}`;

			const cached = cache.get(variantKey);

			if (cached != null) {
				/** Re-inserting moves the key to the end of the map's insertion order, i.e. marks it as most recently used. */
				cache.delete(variantKey);
				cache.set(variantKey, cached);

				return Promise.resolve(cached);
			}

			const computing = pending.get(variantKey);

			if (computing != null) {
				return computing;
			}

			const promise = (async () => {
				const input = await load();

				if (input == null) {
					return undefined;
				}

				const variant = await limit(() => transform(input, options));
				remember(variantKey, variant);

				return variant;
			})().finally(() => {
				pending.delete(variantKey);
			});

			pending.set(variantKey, promise);

			return promise;
		},
	};
}
