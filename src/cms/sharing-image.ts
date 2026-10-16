import { getImageUrl } from "#/src/cms/media.ts";
import { isRasterImage } from "#/src/lib/cms/media/collection.ts";

/** The size recommended by e.g. linkedin and facebook. */
export const sharingImageSize = { width: 1200, height: 630 };

export interface SharingImage {
	url: string;
	alt: string;
	/** Whether the image has the full `sharingImageSize` - see `getSharingImage()`. */
	hasSize: boolean;
}

/**
 * The first of the given media entries which platforms can show when a page is shared: they do not show svgs, so e.g. a
 * page's svg cover image falls back to the site's sharing image.
 */
export async function getSharingImage(
	content: App.Locals["content"],
	ids: ReadonlyArray<string | undefined>,
	site: URL | undefined,
): Promise<SharingImage | undefined> {
	const entries = await Promise.all(ids.filter((id) => id != null).map((id) => content.entry("media", id)));
	const entry = entries.find((item) => item != null && isRasterImage(item.data.contentType));

	if (entry == null) {
		return undefined;
	}

	const { data } = entry;

	return {
		url: new URL(getImageUrl(entry.id, data, { ...sharingImageSize, resize: "fill", format: "jpg" }), site).href,
		alt: data.alt,
		/** Imgproxy does not enlarge images, so a smaller original stays smaller than the requested size. */
		hasSize:
			data.width != null &&
			data.height != null &&
			data.width >= sharingImageSize.width &&
			data.height >= sharingImageSize.height,
	};
}
