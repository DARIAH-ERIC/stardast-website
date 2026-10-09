import { expect, test } from "bun:test";

import sharp from "sharp";

import {
	type ImageVariant,
	type ImageVariantOptions,
	createImageTransformer,
	createTransformLoader,
	parseImageRequest,
	transformWithSharp,
} from "#/src/lib/cms/media/transform.ts";

const config = { sizes: [320, 640, 960], qualities: [50] };

const image = { url: "/media/a/photo.jpg", source: "https://example.org/media/a/photo.jpg" };

function parse(url: string) {
	return parseImageRequest(new URL(url, "https://example.org").searchParams, config);
}

test("builds variant urls which parse back to the same options", () => {
	const loader = createTransformLoader(config);

	const url = loader.getUrl(image, { width: 320, height: 640, resize: "fill", format: "avif", quality: 50 });

	expect(url).toBe("/media/a/photo.jpg?w=320&h=640&fit=fill&f=avif&q=50");
	expect(parse(url).unwrap()).toEqual({ width: 320, height: 640, resize: "fill", format: "avif", quality: 50 });
});

test("defaults to webp, fitted into the size", () => {
	const loader = createTransformLoader(config);

	expect(loader.getUrl(image, { width: 640 })).toBe("/media/a/photo.jpg?w=640&f=webp");
	expect(parse("/media/a/photo.jpg?w=640").unwrap()).toEqual({ width: 640, resize: "fit", format: "webp" });
});

test("throws for variants which would be rejected", () => {
	const loader = createTransformLoader(config);

	expect(() => loader.getUrl(image, { width: 500 })).toThrow("The width must be one of 320, 640, 960.");
	expect(() => loader.getUrl(image, {})).toThrow("The width must be one of 320, 640, 960.");
	expect(() => loader.getUrl(image, { width: 320, quality: 80 })).toThrow("The quality must be one of 50.");
});

test("requests the original without variant parameters", () => {
	expect(parse("/media/a/photo.jpg").unwrap()).toBeUndefined();
	expect(parse("/media/a/photo.jpg?utm_source=newsletter").unwrap()).toBeUndefined();
});

test("rejects sizes, formats, and qualities which are not allowed", () => {
	for (const url of [
		"/media/a/photo.jpg?w=500",
		"/media/a/photo.jpg?w=320&h=100",
		"/media/a/photo.jpg?w=320.5",
		"/media/a/photo.jpg?w=-320",
		"/media/a/photo.jpg?f=webp",
		"/media/a/photo.jpg?w=320&f=gif",
		"/media/a/photo.jpg?w=320&fit=cover",
		"/media/a/photo.jpg?w=320&q=80",
		"/media/a/photo.jpg?w=320&q=",
	]) {
		expect(parse(url).isErr()).toBe(true);
	}
});

function variant(size: number): ImageVariant {
	return { body: new Uint8Array(size), contentType: "image/webp" };
}

const options: ImageVariantOptions = { width: 320, resize: "fit", format: "webp" };

function loadOriginal(): Promise<Uint8Array> {
	return Promise.resolve(new Uint8Array(1));
}

test("caches variants, and loads the original only once", async () => {
	let loads = 0;
	let transforms = 0;
	const transformer = createImageTransformer({
		maxCacheSize: 1000,
		concurrency: 1,
		transform() {
			transforms += 1;
			return Promise.resolve(variant(10));
		},
	});

	function load() {
		loads += 1;
		return loadOriginal();
	}

	const [first, second] = await Promise.all([
		transformer.get("a/photo.jpg", options, load),
		transformer.get("a/photo.jpg", options, load),
	]);
	const third = await transformer.get("a/photo.jpg", options, load);

	expect(first).toBe(second);
	expect(third).toBe(first);
	expect(loads).toBe(1);
	expect(transforms).toBe(1);

	await transformer.get("a/photo.jpg", { ...options, width: 640 }, load);

	expect(transforms).toBe(2);
});

test("evicts the least recently used variants beyond the cache size", async () => {
	let transforms = 0;
	const transformer = createImageTransformer({
		maxCacheSize: 25,
		concurrency: 1,
		transform() {
			transforms += 1;
			return Promise.resolve(variant(10));
		},
	});

	await transformer.get("a", options, loadOriginal);
	await transformer.get("b", options, loadOriginal);
	/** Marks `a` as recently used, so that `b` is evicted. */
	await transformer.get("a", options, loadOriginal);
	await transformer.get("c", options, loadOriginal);
	expect(transforms).toBe(3);

	await transformer.get("a", options, loadOriginal);
	expect(transforms).toBe(3);

	await transformer.get("b", options, loadOriginal);
	expect(transforms).toBe(4);
});

test("does not cache failures, or missing originals", async () => {
	let attempts = 0;
	const transformer = createImageTransformer({
		maxCacheSize: 1000,
		concurrency: 1,
		transform() {
			attempts += 1;
			return attempts === 1 ? Promise.reject(new Error("Corrupt image.")) : Promise.resolve(variant(10));
		},
	});

	expect(await transformer.get("missing", options, () => Promise.resolve(undefined))).toBeUndefined();
	expect(await transformer.get("a", options, loadOriginal).catch(String)).toBe("Error: Corrupt image.");
	expect(await transformer.get("a", options, loadOriginal)).toEqual(variant(10));
});

test("computes at most `concurrency` variants at the same time", async () => {
	let active = 0;
	let maxActive = 0;
	const transformer = createImageTransformer({
		maxCacheSize: 1000,
		concurrency: 2,
		async transform() {
			active += 1;
			maxActive = Math.max(maxActive, active);
			await Bun.sleep(5);
			active -= 1;
			return variant(1);
		},
	});

	await Promise.all(["a", "b", "c", "d", "e"].map((key) => transformer.get(key, options, loadOriginal)));

	expect(maxActive).toBe(2);
});

async function createPhoto(width: number, height: number): Promise<Uint8Array> {
	return new Uint8Array(
		await sharp({ create: { width, height, channels: 3, background: "#7c3aed" } })
			.jpeg()
			.toBuffer(),
	);
}

test("resizes and converts with sharp", async () => {
	const result = await transformWithSharp(await createPhoto(1200, 800), options);
	const metadata = await sharp(result.body).metadata();

	expect(result.contentType).toBe("image/webp");
	expect([metadata.format, metadata.width, metadata.height]).toEqual(["webp", 320, 213]);
});

test("crops to the size with `fill`, and never enlarges", async () => {
	const filled = await transformWithSharp(await createPhoto(1200, 800), {
		width: 320,
		height: 320,
		resize: "fill",
		format: "jpg",
	});
	const small = await transformWithSharp(await createPhoto(200, 100), { ...options, width: 960 });

	expect(filled.contentType).toBe("image/jpeg");
	expect(await sharp(filled.body).metadata()).toMatchObject({ format: "jpeg", width: 320, height: 320 });
	expect(await sharp(small.body).metadata()).toMatchObject({ width: 200, height: 100 });
});
