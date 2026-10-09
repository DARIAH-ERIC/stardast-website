import { env } from "#/configs/env.config.ts";
import { getAuth } from "#/src/cms/auth.ts";
import { type MediaEntryData, config, mediaCollectionName } from "#/src/cms/config.ts";
import { storage } from "#/src/cms/server.ts";
import { createDrafts } from "#/src/lib/cms/drafts.ts";
import {
	type AssetStorage,
	type AssetStorageName,
	createRepositoryAssetStorage,
	createS3AssetStorage,
} from "#/src/lib/cms/media/assets.ts";
import { isRasterImage } from "#/src/lib/cms/media/collection.ts";
import type { ImageLoader, ImageOptions, ImageSource } from "#/src/lib/cms/media/images.ts";
import { type Imgproxy, createImgproxy, createImgproxyLoader } from "#/src/lib/cms/media/imgproxy.ts";
import { type MediaService, createMediaService } from "#/src/lib/cms/media/service.ts";
import {
	type ImageTransformConfig,
	type ImageTransformer,
	createImageTransformer,
	createTransformLoader,
} from "#/src/lib/cms/media/transform.ts";

function createS3AssetStorageFromEnv(): AssetStorage | undefined {
	const { CMS_S3_ENDPOINT, CMS_S3_BUCKET, CMS_S3_ACCESS_KEY_ID, CMS_S3_SECRET_ACCESS_KEY } = env;

	if (
		CMS_S3_ENDPOINT == null ||
		CMS_S3_BUCKET == null ||
		CMS_S3_ACCESS_KEY_ID == null ||
		CMS_S3_SECRET_ACCESS_KEY == null
	) {
		if (env.CMS_ASSETS === "s3") {
			throw new Error(
				"S3 assets require CMS_S3_ENDPOINT, CMS_S3_BUCKET, CMS_S3_ACCESS_KEY_ID, and CMS_S3_SECRET_ACCESS_KEY.",
			);
		}

		return undefined;
	}

	const client = new Bun.S3Client({
		endpoint: CMS_S3_ENDPOINT,
		region: env.CMS_S3_REGION,
		bucket: CMS_S3_BUCKET,
		accessKeyId: CMS_S3_ACCESS_KEY_ID,
		secretAccessKey: CMS_S3_SECRET_ACCESS_KEY,
	});

	return createS3AssetStorage({ client, bucket: CMS_S3_BUCKET, prefix: env.CMS_S3_PREFIX });
}

/** Files uploaded to the repository stay readable after switching to s3, and vice versa when configured. */
export const assets: Partial<Record<AssetStorageName, AssetStorage>> = {
	repo: createRepositoryAssetStorage({ storage, path: config.collections.media.path }),
	s3: createS3AssetStorageFromEnv(),
};

function createImgproxyFromEnv(): Imgproxy | undefined {
	const { IMGPROXY_BASE_URL, IMGPROXY_KEY, IMGPROXY_SALT } = env;

	if (IMGPROXY_BASE_URL == null) {
		return undefined;
	}

	if ((IMGPROXY_KEY == null) !== (IMGPROXY_SALT == null)) {
		throw new Error("Signed imgproxy urls require both IMGPROXY_KEY and IMGPROXY_SALT.");
	}

	/** Unsigned urls let anyone request any number of variants of any source - only acceptable in `astro dev`. */
	if (IMGPROXY_KEY == null && !import.meta.env.DEV) {
		throw new Error("Imgproxy requires IMGPROXY_KEY and IMGPROXY_SALT in production.");
	}

	return createImgproxy({ baseUrl: IMGPROXY_BASE_URL, key: IMGPROXY_KEY, salt: IMGPROXY_SALT });
}

const imgproxy = createImgproxyFromEnv();

/**
 * The widths, and heights, of image variants which the site computes itself, see `createTransformLoader()` - which
 * throws for others. Includes the `widths` of every `CmsImage`, e.g. 192 and 384 for a 12rem logo at 1x and 2x.
 */
export const imageTransformConfig: ImageTransformConfig = {
	sizes: [160, 192, 320, 384, 640, 960, 1280, 1920, 2560],
};

/** Imgproxy when configured, and otherwise the site itself, with sharp - so images are always resized and converted. */
const imageLoader: ImageLoader =
	imgproxy != null ? createImgproxyLoader(imgproxy) : createTransformLoader(imageTransformConfig);

/**
 * Computes the variants requested with `createTransformLoader()` urls - `undefined` with imgproxy, which then computes
 * all variants, so that the site does not compute any for urls which it never builds itself.
 */
export const imageTransformer: ImageTransformer | undefined =
	imgproxy == null ? createImageTransformer({ maxCacheSize: 64 * 1024 * 1024, concurrency: 2 }) : undefined;

let media: MediaService | undefined;

/** Created on first use, since upload tokens need the session secret, see `getAuth()`. */
export function getMedia(): MediaService {
	media ??= createMediaService({
		config,
		storage,
		drafts: createDrafts({ config, storage }),
		collection: mediaCollectionName,
		assets,
		uploadTo: env.CMS_ASSETS,
		uploadTokens: getAuth().uploadTokens,
		maxSize: env.CMS_MAX_UPLOAD_SIZE * 1024 * 1024,
	});

	return media;
}

type MediaReference = Pick<MediaEntryData, "contentType" | "key" | "storage" | "width">;

/** The url of the file as uploaded, served by `/media/[id]/[file]`. */
export function getMediaUrl(id: string, data: Pick<MediaEntryData, "key">): string {
	return `/media/${id}/${data.key.slice(data.key.lastIndexOf("/") + 1)}`;
}

/**
 * The original, for the image loader - or `undefined` when the image is served as uploaded: anything but raster images,
 * since svgs scale anyway, and pdfs are not images.
 */
function getImageSource(id: string, data: MediaReference): ImageSource | undefined {
	const asset = assets[data.storage];

	if (asset == null || !isRasterImage(data.contentType)) {
		return undefined;
	}

	const url = getMediaUrl(id, data);

	return { url, source: asset.getSourceUrl(data.key, new URL(url, env.PUBLIC_APP_BASE_URL).href) };
}

/**
 * Webp unless requested otherwise: an explicit format keeps one cacheable response per url, where `Accept`-based
 * negotiation would need caches to vary on `Accept`.
 */
const defaultImageOptions: ImageOptions = { format: "webp" };

/** The url of a resized and converted image - or of the file as uploaded, see `getImageSource()`. */
export function getImageUrl(id: string, data: MediaReference, options: ImageOptions = {}): string {
	const image = getImageSource(id, data);

	return image != null ? imageLoader.getUrl(image, { ...defaultImageOptions, ...options }) : getMediaUrl(id, data);
}

/**
 * A `srcset` for the given widths - skipping widths above the original's, which would only upscale. An original
 * narrower than all of them gets the smallest width, which leaves it as wide as it is.
 */
export function getImageSrcSet(
	id: string,
	data: MediaReference,
	widths: ReadonlyArray<number>,
	options: Omit<ImageOptions, "width"> = {},
): string | undefined {
	const image = getImageSource(id, data);

	if (image == null) {
		return undefined;
	}

	const available = widths.filter((width) => data.width == null || width <= data.width);
	const candidates =
		available.length > 0
			? available.map((width) => {
					return { width, descriptor: width };
				})
			: [{ width: Math.min(...widths), descriptor: data.width ?? Math.min(...widths) }];

	return candidates
		.map(
			({ width, descriptor }) =>
				`${imageLoader.getUrl(image, { ...defaultImageOptions, ...options, width })} ${String(descriptor)}w`,
		)
		.join(", ");
}
