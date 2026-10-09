import { expect, test } from "bun:test";

import * as v from "valibot";

import { createSealedCodec } from "#/src/lib/cms/auth/sealed.ts";

const secret = "s".repeat(32);
const schema = v.object({ login: v.string() });

test("round-trips values", async () => {
	const codec = createSealedCodec({ secret, purpose: "session", schema });

	expect(await codec.unseal(await codec.seal({ login: "jane" }, { maxAge: 60 }))).toEqual({ login: "jane" });
});

test("rejects tampered, expired, and foreign values", async () => {
	let now = 0;
	const codec = createSealedCodec({ secret, purpose: "session", schema, now: () => now });
	const sealed = await codec.seal({ login: "jane" }, { maxAge: 60 });

	const [iv, ciphertext] = sealed.split(".") as [string, string];
	const flipped = Buffer.from(ciphertext, "base64url");
	flipped[0]! ^= 1;

	expect(await codec.unseal(`${iv}.${flipped.toString("base64url")}`)).toBeUndefined();
	expect(await codec.unseal("garbage")).toBeUndefined();
	expect(await createSealedCodec({ secret, purpose: "oauth", schema }).unseal(sealed)).toBeUndefined();
	expect(
		await createSealedCodec({ secret: "t".repeat(32), purpose: "session", schema }).unseal(sealed),
	).toBeUndefined();
	expect(
		await createSealedCodec({ secret, purpose: "session", schema: v.object({ id: v.number() }) }).unseal(sealed),
	).toBeUndefined();

	now += 60_001;

	expect(await codec.unseal(sealed)).toBeUndefined();
});

test("requires a long secret", () => {
	expect(() => createSealedCodec({ secret: "short", purpose: "session", schema })).toThrow(/at least 32/);
});
