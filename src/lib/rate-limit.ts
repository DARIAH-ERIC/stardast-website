export type RateLimitResult = { allowed: true } | { allowed: false; resetAt: number };

export interface RateLimit {
	/** Counts a request, unless the limit for the current window is reached. */
	take: () => RateLimitResult;
}

/**
 * Allows `limit` requests per fixed window of `window` milliseconds. Counted in-process, which suffices since the site
 * runs as a single replica, see `.github/auto-deploy-values.yaml`.
 */
export function createRateLimit(params: { limit: number; window: number; now?: () => number }): RateLimit {
	const { limit, window, now = Date.now } = params;

	let windowStart = Number.NEGATIVE_INFINITY;
	let count = 0;

	return {
		take() {
			const time = now();

			if (time - windowStart >= window) {
				windowStart = time;
				count = 0;
			}

			if (count >= limit) {
				return { allowed: false, resetAt: windowStart + window };
			}

			count += 1;

			return { allowed: true };
		},
	};
}
