import { expect, test } from "bun:test";

import { createRateLimit } from "#/src/lib/rate-limit.ts";

test("allows requests up to the limit, then until the window ends", () => {
	let time = 1000;
	const rateLimit = createRateLimit({ limit: 2, window: 100, now: () => time });

	expect(rateLimit.take()).toEqual({ allowed: true });
	expect(rateLimit.take()).toEqual({ allowed: true });
	expect(rateLimit.take()).toEqual({ allowed: false, resetAt: 1100 });

	time = 1099;
	expect(rateLimit.take()).toEqual({ allowed: false, resetAt: 1100 });

	time = 1100;
	expect(rateLimit.take()).toEqual({ allowed: true });
});
