/**
 * Least-recently-used cache for promises, so that concurrent reads of the same key share one request. Rejected promises
 * are evicted, so that a failed request is retried on the next read.
 */
export function createPromiseCache<TValue>(params: { max: number }): {
	get: (key: string, load: () => Promise<TValue>) => Promise<TValue>;
} {
	const { max } = params;

	const entries = new Map<string, Promise<TValue>>();

	return {
		get(key, load) {
			const cached = entries.get(key);

			if (cached != null) {
				/** Re-inserting moves the key to the end of the map's insertion order, i.e. marks it as most recently used. */
				entries.delete(key);
				entries.set(key, cached);

				return cached;
			}

			const promise = load();

			promise.catch(() => {
				if (entries.get(key) === promise) {
					entries.delete(key);
				}
			});

			entries.set(key, promise);

			if (entries.size > max) {
				entries.delete(entries.keys().next().value!);
			}

			return promise;
		},
	};
}
