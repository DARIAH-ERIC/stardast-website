import { Result } from "better-result";
import * as v from "valibot";

import { ValidationError } from "#/src/lib/env/errors.ts";

/**
 * `none` skips validation entirely, `build` validates what a build requires - the values inlined into the client
 * bundle, plus build tooling configuration - and `full` additionally validates the values a running server needs.
 */
const validationModes = ["build", "full", "none"] as const;

const ValidationModeSchema = v.fallback(v.picklist(validationModes), "full");

type PrefixedEntries<TPrefix extends string | undefined, T extends v.ObjectEntries> = {
	[K in keyof T]: TPrefix extends undefined ? T[K] : K extends `${TPrefix}${string}` ? T[K] : never;
};

type UnprefixedEntries<TPrefix extends string | undefined, T extends v.ObjectEntries> = {
	[K in keyof T]: TPrefix extends undefined ? T[K] : K extends `${TPrefix}${string}` ? never : T[K];
};

type PrefixedKeys<TPrefix extends string | undefined, T extends v.ObjectEntries> = {
	[K in keyof T]: TPrefix extends undefined ? K : K extends `${TPrefix}${string}` ? K : never;
}[keyof T];

type UnprefixedKeys<TPrefix extends string | undefined, T extends v.ObjectEntries> = {
	[K in keyof T]: TPrefix extends undefined ? K : K extends `${TPrefix}${string}` ? never : K;
}[keyof T];

/**
 * Environment variables which are only needed once a server is running are not validated in the `build` mode, and are
 * therefore missing from the validated environment. Reading them would silently yield `undefined` - e.g. a route
 * prerendered at build time would fetch without an api access token, and fail with a rate limit error, instead of
 * failing with a missing environment variable. We therefore throw on access instead.
 */
function throwOnAccess<T extends object>(environment: T, keys: Array<string>): T {
	const runtimeOnly = new Set(keys);

	return new Proxy(environment, {
		get(target, key, receiver) {
			if (typeof key === "string" && runtimeOnly.has(key) && !(key in target)) {
				throw new Error(
					`Environment variable "${key}" is only validated at runtime, and must not be read at build time.`,
				);
			}

			return Reflect.get(target, key, receiver);
		},
	});
}

export function define<
	TClientPrefix extends string | undefined,
	// oxlint-disable-next-line typescript/ban-types, typescript/no-empty-object-type
	TClient extends v.ObjectEntries = {},
	// oxlint-disable-next-line typescript/ban-types, typescript/no-empty-object-type
	TServerBuild extends v.ObjectEntries = {},
	// oxlint-disable-next-line typescript/ban-types, typescript/no-empty-object-type
	TServerRuntime extends v.ObjectEntries = {},
>(params: {
	clientPrefix?: TClientPrefix;
	client?: v.ObjectSchema<PrefixedEntries<TClientPrefix, TClient>, undefined>;
	/**
	 * Not exposed to the client, but required while building the app, so these are validated in the `build` mode as well
	 * as in `full`.
	 */
	serverBuild?: v.ObjectSchema<UnprefixedEntries<TClientPrefix, TServerBuild>, undefined>;
	serverRuntime?: v.ObjectSchema<UnprefixedEntries<TClientPrefix, TServerRuntime>, undefined>;
}) {
	const { client, serverBuild, serverRuntime } = params;

	return function validate(params: {
		environment: Record<
			| PrefixedKeys<TClientPrefix, TClient>
			| UnprefixedKeys<TClientPrefix, TServerBuild>
			| UnprefixedKeys<TClientPrefix, TServerRuntime>,
			unknown
		>;
		/** One of `build`, `full`, or `none`. Defaults to `full`, also for unknown values. */
		mode?: string;
	}): Result<
		Readonly<v.InferOutput<v.ObjectSchema<TClient & TServerBuild & TServerRuntime, undefined>>>,
		ValidationError
	> {
		const { environment: _environment, mode: _mode } = params;

		return Result.try({
			try: () => {
				const mode = v.parse(ValidationModeSchema, _mode);

				const environment = {} as Record<string, unknown>;

				for (const [key, value] of Object.entries(_environment)) {
					if (value == null || value === "") {
						continue;
					}

					environment[key] = value;
				}

				if (mode === "none") {
					// oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unsafe-return
					return Object.freeze(environment as any);
				}

				const isClientEnvironment = "document" in globalThis;

				if (isClientEnvironment) {
					const Schema = v.object({ ...client?.entries });
					return Object.freeze(v.parse(Schema, environment));
				}

				switch (mode) {
					case "build": {
						const Schema = v.object({
							...client?.entries,
							...serverBuild?.entries,
						});
						return throwOnAccess(
							Object.freeze(v.parse(Schema, environment)),
							Object.keys(serverRuntime?.entries ?? {}),
						);
					}

					case "full": {
						const Schema = v.object({
							...client?.entries,
							...serverBuild?.entries,
							...serverRuntime?.entries,
						});
						return Object.freeze(v.parse(Schema, environment));
					}
				}
			},
			catch: (cause) =>
				new ValidationError({
					cause,
					message: v.isValiError(cause) ? v.summarize(cause.issues) : undefined,
				}),
		});
	};
}
