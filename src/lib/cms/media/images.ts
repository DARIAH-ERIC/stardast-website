export interface ImageOptions {
	width?: number;
	height?: number;
	/** `fit` keeps the aspect ratio within the given size, `fill` crops to it. */
	resize?: "fill" | "fit";
	format?: "avif" | "jpg" | "png" | "webp";
	quality?: number;
}

export interface ImageSource {
	/** The original's url on the site, see `/media/[id]/[file]`. */
	url: string;
	/** Where an external image service reads the original from, see `AssetStorage.getSourceUrl()`. */
	source: string;
}

/**
 * Builds the url of a resized and converted variant of an image - like a next.js image loader. Variants are served by
 * imgproxy, see `createImgproxyLoader()`, or by the site itself, see `createTransformLoader()`.
 */
export interface ImageLoader {
	getUrl: (image: ImageSource, options: ImageOptions) => string;
}
