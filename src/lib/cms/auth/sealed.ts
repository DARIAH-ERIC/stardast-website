import * as v from "valibot";

/**
 * Encrypts and authenticates small payloads for cookies - sessions, and oauth state - with aes-gcm, so that they need
 * no server-side storage. Each `purpose` derives its own key, so a value sealed for one purpose cannot be used as
 * another, e.g. an oauth state cookie as a session.
 */
export interface SealedCodec<T> {
	seal: (value: T, params: { maxAge: number }) => Promise<string>;
	/** Returns `undefined` for tampered, expired, or malformed values, and for values sealed with another secret. */
	unseal: (sealed: string) => Promise<T | undefined>;
}

const encoder = new TextEncoder();

async function deriveKey(secret: string, purpose: string): Promise<CryptoKey> {
	const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"]);

	return crypto.subtle.deriveKey(
		{ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: encoder.encode(`stardast-cms:${purpose}`) },
		material,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

export function createSealedCodec<TSchema extends v.GenericSchema>(params: {
	secret: string;
	purpose: string;
	schema: TSchema;
	now?: () => number;
}): SealedCodec<v.InferOutput<TSchema>> {
	const { secret, purpose, schema, now = Date.now } = params;

	if (secret.length < 32) {
		throw new Error("The secret must be at least 32 characters long.");
	}

	const key = deriveKey(secret, purpose);

	const EnvelopeSchema = v.object({ expiresAt: v.number(), value: v.unknown() });

	return {
		async seal(value, { maxAge }) {
			const iv = crypto.getRandomValues(new Uint8Array(12));
			const plaintext = encoder.encode(JSON.stringify({ expiresAt: now() + maxAge * 1000, value }));
			const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key, plaintext);

			return `${Buffer.from(iv).toString("base64url")}.${Buffer.from(ciphertext).toString("base64url")}`;
		},

		async unseal(sealed) {
			const [iv, ciphertext, ...rest] = sealed.split(".");

			if (iv == null || ciphertext == null || rest.length > 0) {
				return undefined;
			}

			try {
				const plaintext = await crypto.subtle.decrypt(
					{ name: "AES-GCM", iv: Buffer.from(iv, "base64url") },
					await key,
					Buffer.from(ciphertext, "base64url"),
				);
				const envelope = v.parse(EnvelopeSchema, JSON.parse(new TextDecoder().decode(plaintext)));

				if (envelope.expiresAt <= now()) {
					return undefined;
				}

				const result = v.safeParse(schema, envelope.value);

				return result.success ? result.output : undefined;
			} catch {
				return undefined;
			}
		},
	};
}

/** Random, url-safe value, e.g. for oauth `state` and pkce code verifiers. */
export function createRandomToken(bytes = 32): string {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
}
