import { afterAll, expect, test } from "bun:test";

import { createS3AssetStorage } from "#/src/lib/cms/media/assets.ts";

/** Path-style s3, like ceph's rados gateway is usually addressed. Ignores signatures. */
const objects = new Map<string, { body: Uint8Array<ArrayBuffer>; type: string }>();
const server = Bun.serve({
	port: 0,
	async fetch(request) {
		const url = new URL(request.url);
		const key = decodeURIComponent(url.pathname);

		switch (request.method) {
			case "PUT": {
				objects.set(key, {
					body: new Uint8Array(await request.arrayBuffer()),
					type: request.headers.get("content-type") ?? "",
				});
				return new Response(null, { status: 200, headers: { etag: '"etag"' } });
			}
			case "HEAD":
			case "GET": {
				const object = objects.get(key);

				if (object == null) {
					return new Response(request.method === "GET" ? "<Error><Code>NoSuchKey</Code></Error>" : null, {
						status: 404,
					});
				}

				return new Response(request.method === "GET" ? object.body : null, {
					headers: {
						"content-length": String(object.body.byteLength),
						"content-type": object.type,
						etag: '"etag"',
						"last-modified": new Date().toUTCString(),
					},
				});
			}
			case "DELETE": {
				objects.delete(key);
				return new Response(null, { status: 204 });
			}
			default: {
				return new Response(null, { status: 405 });
			}
		}
	},
});

afterAll(() => {
	void server.stop(true);
});

const client = new Bun.S3Client({
	endpoint: `http://localhost:${String(server.port)}`,
	bucket: "media",
	accessKeyId: "key",
	secretAccessKey: "secret",
	region: "us-east-1",
});
const assets = createS3AssetStorage({ client, bucket: "media", prefix: "stardast/" });

test("presigned uploads go straight to the bucket", async () => {
	const key = assets.createKey("photo-a1b2c3", "photo.jpg");
	const url = (await assets.createUploadUrl({ key, contentType: "image/jpeg", expiresIn: 600 }))!;

	expect(key).toBe("stardast/media/photo-a1b2c3/photo.jpg");
	expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("600");
	expect(new URL(url).searchParams.has("X-Amz-Signature")).toBe(true);

	const response = await fetch(url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: "jpeg" });

	expect(response.ok).toBe(true);
	expect(await assets.stat(key)).toEqual({ size: 4 });
	expect(await (await assets.get(key))!.text()).toBe("jpeg");
});

test("puts, stats, and deletes", async () => {
	const key = assets.createKey("doc-x", "doc.pdf");

	expect(await assets.stat(key)).toBeUndefined();
	expect(await assets.get(key)).toBeUndefined();

	await assets.put({
		key,
		content: new Uint8Array([1, 2, 3]),
		contentType: "application/pdf",
		author: { name: "", email: "" },
	});
	expect(await assets.stat(key)).toEqual({ size: 3 });

	await assets.delete(key);
	expect(await assets.stat(key)).toBeUndefined();
	expect(assets.getSourceUrl(key, "https://example.org/media/doc-x/doc.pdf")).toBe(
		"s3://media/stardast/media/doc-x/doc.pdf",
	);
});
