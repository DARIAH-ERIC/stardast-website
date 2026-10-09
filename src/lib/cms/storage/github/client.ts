import { createPrivateKey, sign } from "node:crypto";

import { TaggedError } from "better-result";

/** Narrower than `typeof fetch`, so that tests can pass a plain function. */
export type Fetch = (input: URL, init?: RequestInit) => Promise<Response>;

const defaultHeaders = {
	accept: "application/vnd.github+json",
	"x-github-api-version": "2022-11-28",
};

/** Appends instead of resolving the path, which would drop a base path, e.g. github enterprise server's `/api/v3`. */
function createUrl(baseUrl: string, path: string): URL {
	return new URL(`${baseUrl.replace(/\/+$/, "")}${path}`);
}

export class GitHubApiError extends TaggedError("GitHubApiError")<{
	readonly message: string;
	readonly method: string;
	readonly path: string;
	readonly status: number;
}> {}

export interface TokenProvider {
	getToken: () => Promise<string>;
}

/** E.g. a fine-grained personal access token with read and write access to the repository's contents, for development. */
export function createStaticTokenProvider(token: string): TokenProvider {
	return {
		getToken() {
			return Promise.resolve(token);
		},
	};
}

/** Installation tokens are valid for an hour. Renew early, so that a token does not expire during a request. */
const tokenRenewalMargin = 5 * 60 * 1000;

/**
 * Authenticates as a github app installation, which only has the permissions granted to the app, and only on the
 * repositories it is installed on. Commits are attributed to the app as committer.
 */
export function createAppTokenProvider(params: {
	appId: string;
	installationId: string;
	/** Pem-encoded, as downloaded from github (pkcs#1), or converted to pkcs#8. */
	privateKey: string;
	baseUrl?: string;
	fetch?: Fetch;
	now?: () => number;
}): TokenProvider {
	const {
		appId,
		installationId,
		baseUrl = "https://api.github.com",
		fetch = globalThis.fetch,
		now = Date.now,
	} = params;

	const privateKey = createPrivateKey(params.privateKey);

	let token: Promise<{ token: string; expiresAt: number }> | undefined;

	/** @see {@link https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app} */
	function createJwt(): string {
		const issuedAt = Math.floor(now() / 1000) - 60;
		const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
		const payload = base64url(JSON.stringify({ iat: issuedAt, exp: issuedAt + 9 * 60, iss: appId }));
		const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");

		return `${header}.${payload}.${signature}`;
	}

	async function createToken(): Promise<{ token: string; expiresAt: number }> {
		const path = `/app/installations/${encodeURIComponent(installationId)}/access_tokens`;
		const response = await fetch(createUrl(baseUrl, path), {
			method: "POST",
			headers: { ...defaultHeaders, authorization: `Bearer ${createJwt()}` },
		});

		if (!response.ok) {
			throw new GitHubApiError({
				message: `Failed to create installation access token: ${await response.text()}`,
				method: "POST",
				path,
				status: response.status,
			});
		}

		const body = (await response.json()) as { token: string; expires_at: string };

		return { token: body.token, expiresAt: Date.parse(body.expires_at) };
	}

	return {
		async getToken() {
			const pending = token;
			const current = await pending?.catch(() => undefined);

			if (current != null && current.expiresAt - tokenRenewalMargin > now()) {
				return current.token;
			}

			/** Concurrent callers which found the same expired token share one renewal. */
			if (token === pending) {
				token = createToken();
			}

			return (await token!).token;
		},
	};
}

function base64url(value: string): string {
	return Buffer.from(value).toString("base64url");
}

/** Github is rate-limiting this client: requests will fail until `retryAt`. */
export class RateLimitError extends TaggedError("RateLimitError")<{
	readonly message: string;
	readonly method: string;
	readonly path: string;
	readonly retryAt: Date;
}> {}

export interface RateLimitStatus {
	limit: number;
	remaining: number;
	resetAt: Date;
}

/**
 * How long to wait before retrying a rate-limited request, in milliseconds - or `undefined` if the response is not
 * about rate limits, e.g. a 403 for missing permissions.
 *
 * @see {@link https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api#rate-limit-errors}
 */
function getRateLimitDelay(response: Response, body: string, now: number): number | undefined {
	if (response.status !== 403 && response.status !== 429) {
		return undefined;
	}

	const retryAfter = response.headers.get("retry-after");

	if (retryAfter != null && /^\d+$/.test(retryAfter)) {
		return Number(retryAfter) * 1000;
	}

	const reset = response.headers.get("x-ratelimit-reset");

	if (response.headers.get("x-ratelimit-remaining") === "0" && reset != null) {
		return Math.max(0, Number(reset) * 1000 - now);
	}

	/** Secondary rate limits without `retry-after`: github asks to wait at least a minute. */
	if (/secondary rate limit/i.test(body)) {
		return 60_000;
	}

	return undefined;
}

function getRateLimitStatus(response: Response): RateLimitStatus | undefined {
	const limit = response.headers.get("x-ratelimit-limit");
	const remaining = response.headers.get("x-ratelimit-remaining");
	const reset = response.headers.get("x-ratelimit-reset");

	if (limit == null || remaining == null || reset == null) {
		return undefined;
	}

	return { limit: Number(limit), remaining: Number(remaining), resetAt: new Date(Number(reset) * 1000) };
}

export type ConditionalResponse<T> =
	| { status: "not-found" }
	| { status: "not-modified" }
	| { status: "ok"; data: T; etag: string | undefined };

export interface GitHubClient {
	readonly owner: string;
	readonly repo: string;
	/**
	 * Sends a request to a path relative to the repository, e.g. `/git/trees/main`. Resolves with `undefined` for a 404
	 * or 204, and with the parsed json - or the raw text, for `raw: true` - otherwise. Throws a `RateLimitError` when
	 * rate limited, and a `GitHubApiError` on other errors.
	 */
	request: <T>(params: {
		method?: "DELETE" | "GET" | "PATCH" | "POST";
		path: string;
		body?: unknown;
		/** `true` for text, `"bytes"` for binary content, e.g. of blobs. */
		raw?: boolean | "bytes";
	}) => Promise<T | undefined>;
	/**
	 * Sends a `GET` with `If-None-Match`. A 304 does not count against github's primary rate limit, so this is free when
	 * nothing changed.
	 */
	requestConditional: <T>(params: { path: string; etag: string | undefined }) => Promise<ConditionalResponse<T>>;
}

export function createGitHubClient(params: {
	/** In `owner/repo` format. */
	repository: string;
	auth: TokenProvider;
	baseUrl?: string;
	fetch?: Fetch;
	/** Rate-limited requests are retried once, if github asks to wait at most this long, in milliseconds. */
	maxRetryDelay?: number;
	/** Called - at most once per rate limit window - when less than 10% of the primary rate limit remains. */
	onRateLimitWarning?: (status: RateLimitStatus) => void;
	now?: () => number;
	sleep?: (milliseconds: number) => Promise<void>;
}): GitHubClient {
	const {
		repository,
		auth,
		baseUrl = "https://api.github.com",
		fetch = globalThis.fetch,
		maxRetryDelay = 3000,
		onRateLimitWarning,
		now = Date.now,
		sleep = (milliseconds: number) => Bun.sleep(milliseconds),
	} = params;

	const [owner, repo, ...rest] = repository.split("/");

	if (owner == null || repo == null || owner === "" || repo === "" || rest.length > 0) {
		throw new Error(`Repository must be in "owner/repo" format, but is "${repository}".`);
	}

	const repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

	let lastWarnedResetAt: number | undefined;

	function observeRateLimit(response: Response): void {
		const status = getRateLimitStatus(response);

		if (status == null || status.remaining >= status.limit * 0.1 || lastWarnedResetAt === status.resetAt.getTime()) {
			return;
		}

		lastWarnedResetAt = status.resetAt.getTime();
		onRateLimitWarning?.(status);
	}

	/** Resolves with the response for 2xx, 304, and 404 - and throws for everything else. */
	async function send(params: {
		method: "DELETE" | "GET" | "PATCH" | "POST";
		path: string;
		body?: unknown;
		headers?: Record<string, string>;
	}): Promise<Response> {
		const { method, path, body, headers } = params;

		for (let attempt = 1; ; attempt++) {
			// oxlint-disable-next-line no-await-in-loop
			const response = await fetch(createUrl(baseUrl, `${repositoryPath}${path}`), {
				method,
				headers: {
					...defaultHeaders,
					...(body !== undefined ? { "content-type": "application/json" } : {}),
					...headers,
					// oxlint-disable-next-line no-await-in-loop
					authorization: `Bearer ${await auth.getToken()}`,
				},
				body: body !== undefined ? JSON.stringify(body) : undefined,
			});

			observeRateLimit(response);

			if (response.ok || response.status === 304 || response.status === 404) {
				return response;
			}

			// oxlint-disable-next-line no-await-in-loop
			const text = await response.text();
			const delay = getRateLimitDelay(response, text, now());

			if (delay == null) {
				throw new GitHubApiError({
					message: `GitHub api request ${method} ${path} failed with status ${String(response.status)}: ${text}`,
					method,
					path,
					status: response.status,
				});
			}

			if (attempt > 1 || delay > maxRetryDelay) {
				throw new RateLimitError({
					message: `GitHub api request ${method} ${path} was rate limited.`,
					method,
					path,
					retryAt: new Date(now() + delay),
				});
			}

			// oxlint-disable-next-line no-await-in-loop
			await sleep(delay);
		}
	}

	return {
		owner,
		repo,

		async request<T>({
			method = "GET",
			path,
			body,
			raw = false,
		}: {
			method?: "DELETE" | "GET" | "PATCH" | "POST";
			path: string;
			body?: unknown;
			raw?: boolean | "bytes";
		}): Promise<T | undefined> {
			const response = await send({
				method,
				path,
				body,
				headers: raw !== false ? { accept: "application/vnd.github.raw+json" } : undefined,
			});

			/** 204 is the response to e.g. deleting a ref, which has no body. */
			if (response.status === 404 || response.status === 204) {
				return undefined;
			}

			if (raw === "bytes") {
				return new Uint8Array(await response.arrayBuffer()) as T;
			}

			return (raw ? await response.text() : await response.json()) as T;
		},

		async requestConditional<T>({
			path,
			etag,
		}: {
			path: string;
			etag: string | undefined;
		}): Promise<ConditionalResponse<T>> {
			const response = await send({
				method: "GET",
				path,
				headers: etag != null ? { "if-none-match": etag } : undefined,
			});

			if (response.status === 304) {
				return { status: "not-modified" } as const;
			}

			if (response.status === 404) {
				return { status: "not-found" } as const;
			}

			return {
				status: "ok",
				data: (await response.json()) as T,
				etag: response.headers.get("etag") ?? undefined,
			} as const;
		},
	};
}
