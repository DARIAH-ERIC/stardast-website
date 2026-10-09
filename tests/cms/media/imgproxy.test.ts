import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";

import { createImgproxy } from "#/src/lib/cms/media/imgproxy.ts";

const key = "943b421c9eb07c830af81030552c86009268de4e532ba2ee2eab8247c6da0881";
const salt = "520f986b998545b4785e0defbc4f3c1203f22de2374a3d53cb7a7fe9fea309c5";

test("signs the path with the hex-decoded key and salt", () => {
	const imgproxy = createImgproxy({ baseUrl: "https://imgproxy.example.org/", key, salt });

	const url = imgproxy.getUrl("https://example.org/media/a/photo.jpg", { width: 640, format: "webp" });
	const [, signature, ...rest] = new URL(url).pathname.split("/");
	const path = `/${rest.join("/")}`;

	expect(path).toBe(`/rs:fit:640:0/${Buffer.from("https://example.org/media/a/photo.jpg").toString("base64url")}.webp`);
	expect(signature).toBe(
		createHmac("sha256", Buffer.from(key, "hex")).update(Buffer.from(salt, "hex")).update(path).digest("base64url"),
	);
});

/** The example from imgproxy's documentation, with key "secret", and salt "hello". */
test("matches imgproxy's reference signature", () => {
	const imgproxy = createImgproxy({ baseUrl: "http://imgproxy.example.com", key: "736563726574", salt: "68656C6C6F" });

	expect(imgproxy.sign("/rs:fill:300:400:0/g:sm/aHR0cDovL2V4YW1w/bGUuY29tL2ltYWdl/cy9jdXJpb3NpdHku/anBn.png")).toBe(
		"oKfUtW34Dvo2BGQehJFR4Nr0_rIjOtdtzJ3QFsUcXH8",
	);
});

test("uses insecure urls without key and salt", () => {
	const imgproxy = createImgproxy({ baseUrl: "https://imgproxy.example.org" });

	expect(
		imgproxy.getUrl("s3://bucket/media/a/photo.jpg", { width: 320, height: 200, resize: "fill", quality: 80 }),
	).toBe(
		`https://imgproxy.example.org/insecure/rs:fill:320:200/q:80/${Buffer.from("s3://bucket/media/a/photo.jpg").toString("base64url")}`,
	);
});
