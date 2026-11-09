import { Result } from "better-result";

export interface CachedLoader<T, E> {
	/** The cached value while it is fresh - and otherwise loads it again, falling back to the cached value on failure. */
	get: () => Promise<Result<T, E>>;
}

/**
 * Caches the value of a slow or rate limited source, e.g. an external api, in memory - concurrent calls share one load.
 * When loading fails, the last value is served for another `retryAfter`, rather than an error, so that an outage of the
 * source only shows slightly outdated data. Errors are only returned while there is no value yet.
 */
export function createCachedLoader<T, E>(params: {
	load: () => Promise<Result<T, E>>;
	/** In milliseconds. */
	maxAge: number;
	/** In milliseconds - how long to serve the last value after loading failed, before trying again. */
	retryAfter: number;
	onError?: (error: E) => void;
	now?: () => number;
}): CachedLoader<T, E> {
	const { load, maxAge, retryAfter, onError, now = Date.now } = params;

	let cached: { value: T; expiresAt: number } | undefined;
	let pending: Promise<Result<T, E>> | undefined;

	async function reload(): Promise<Result<T, E>> {
		const result = await load();

		if (result.isOk()) {
			cached = { value: result.value, expiresAt: now() + maxAge };

			return result;
		}

		onError?.(result.error);

		if (cached != null) {
			cached = { value: cached.value, expiresAt: now() + retryAfter };

			return Result.ok(cached.value);
		}

		return result;
	}

	return {
		get() {
			if (cached != null && now() < cached.expiresAt) {
				return Promise.resolve(Result.ok(cached.value));
			}

			pending ??= reload().finally(() => {
				pending = undefined;
			});

			return pending;
		},
	};
}
