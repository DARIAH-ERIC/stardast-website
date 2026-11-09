import { expect, test } from "bun:test";

import { Result } from "better-result";

import { createCachedLoader } from "#/src/lib/cached-loader.ts";

function createLoader(results: Array<Result<string, string>>) {
	let time = 0;
	let loads = 0;
	const errors: Array<string> = [];

	const loader = createCachedLoader({
		load() {
			const result = results[loads]!;
			loads++;

			return Promise.resolve(result);
		},
		maxAge: 100,
		retryAfter: 10,
		onError(error) {
			errors.push(error);
		},
		now: () => time,
	});

	return {
		loader,
		errors,
		get loads() {
			return loads;
		},
		advance(milliseconds: number) {
			time += milliseconds;
		},
	};
}

test("serves the cached value until it expires", async () => {
	const state = createLoader([Result.ok("a"), Result.ok("b")]);

	expect((await state.loader.get()).unwrap()).toBe("a");
	state.advance(99);
	expect((await state.loader.get()).unwrap()).toBe("a");
	expect(state.loads).toBe(1);

	state.advance(1);
	expect((await state.loader.get()).unwrap()).toBe("b");
	expect(state.loads).toBe(2);
});

test("shares one load between concurrent calls", async () => {
	const state = createLoader([Result.ok("a")]);

	const results = await Promise.all([state.loader.get(), state.loader.get()]);

	expect(results.map((result) => result.unwrap())).toEqual(["a", "a"]);
	expect(state.loads).toBe(1);
});

test("serves the last value when loading fails, and tries again after a while", async () => {
	const state = createLoader([Result.ok("a"), Result.err("down"), Result.ok("b")]);

	await state.loader.get();
	state.advance(100);
	expect((await state.loader.get()).unwrap()).toBe("a");
	expect(state.errors).toEqual(["down"]);

	state.advance(9);
	expect((await state.loader.get()).unwrap()).toBe("a");
	expect(state.loads).toBe(2);

	state.advance(1);
	expect((await state.loader.get()).unwrap()).toBe("b");
});

test("returns the error while there is no value yet", async () => {
	const state = createLoader([Result.err("down"), Result.ok("a")]);

	const failed = await state.loader.get();
	expect(failed.isErr() && failed.error).toBe("down");

	expect((await state.loader.get()).unwrap()).toBe("a");
});
