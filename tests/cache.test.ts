import { expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { cacheKeyQueryParams } from "#/src/config/cache.ts";
import { newsletterStatusParam } from "#/src/lib/newsletter/status.ts";

/** Parameters which are read with a constant, rather than a string literal. */
const constants: Record<string, string> = { newsletterStatusParam };

test("every query parameter which the site reads is part of cache keys", async () => {
	const root = path.join(import.meta.dirname, "../src");
	const files = (await fs.readdir(root, { recursive: true })).filter((file) => /\.(?:astro|ts|tsx)$/.test(file));

	const sources = await Promise.all(files.map((file) => Bun.file(path.join(root, file)).text()));

	const params = new Set<string>();

	sources.forEach((source, index) => {
		for (const match of source.matchAll(/searchParams\.(?:get|getAll|has)\((?<argument>[^),]+)[),]/g)) {
			const argument = match.groups!.argument!.trim();
			const name = /^"(?<name>[^"]+)"$/.exec(argument)?.groups!.name ?? constants[argument];

			expect(name, `${files[index]!} reads a query parameter with ${argument} - use a string literal`).toBeDefined();
			params.add(name!);
		}
	});

	expect(params.size).toBeGreaterThan(0);

	for (const param of params) {
		expect(cacheKeyQueryParams as ReadonlyArray<string>, `"${param}" is missing from cacheKeyQueryParams`).toContain(
			param,
		);
	}
});
