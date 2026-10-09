import { type Collection, collection } from "#/src/lib/cms/schema/config.ts";
import { number, optional, readOnly, select, text, textarea } from "#/src/lib/cms/schema/fields.ts";

/** Content types which can be uploaded, with the file extension they are stored with. */
export const mediaContentTypes = {
	"application/pdf": "pdf",
	"image/avif": "avif",
	"image/gif": "gif",
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/svg+xml": "svg",
	"image/webp": "webp",
} as const;

export type MediaContentType = keyof typeof mediaContentTypes;

export function isMediaContentType(value: string): value is MediaContentType {
	return Object.hasOwn(mediaContentTypes, value);
}

/** Raster images, which imgproxy can resize and convert. */
export function isRasterImage(contentType: string): boolean {
	return contentType.startsWith("image/") && contentType !== "image/svg+xml";
}

const mediaFields = {
	alt: textarea({
		label: "Alternative text",
		description:
			"Describes the image for people who cannot see it, e.g. with a screen reader. Leave empty if the image is purely decorative.",
	}),
	caption: optional(textarea({ label: "Caption" })),
	credit: optional(text({ label: "Credit", description: "E.g. the photographer, or the copyright holder." })),
	license: optional(text({ label: "License", description: "E.g. CC BY 4.0." })),
	filename: readOnly(text({ label: "File name" })),
	contentType: readOnly(
		select({
			label: "File type",
			options: Object.keys(mediaContentTypes).map((value) => {
				return { value: value as MediaContentType, label: value };
			}),
			defaultValue: "image/jpeg",
		}),
	),
	size: readOnly(number({ label: "File size (bytes)", integer: true })),
	width: optional(readOnly(number({ label: "Width (pixels)", integer: true }))),
	height: optional(readOnly(number({ label: "Height (pixels)", integer: true }))),
	storage: readOnly(
		select({
			label: "Storage",
			options: [
				{ value: "repo", label: "Content repository" },
				{ value: "s3", label: "Object storage" },
			],
			defaultValue: "repo",
		}),
	),
	key: readOnly(text({ label: "Storage key" })),
};

export type MediaFields = typeof mediaFields;

/**
 * The media library: one entry per uploaded file, holding its metadata - the file itself is stored with an asset
 * storage, see `assets.ts`. Entries are created by uploading, so the file metadata cannot be edited.
 */
export function createMediaCollection(params: { path?: string } = {}): Collection<MediaFields> {
	const { path = "content/media" } = params;

	return collection({
		label: "Media",
		path,
		slug: { from: "filename" },
		fields: mediaFields,
	});
}
