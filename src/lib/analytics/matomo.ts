import { Result, TaggedError } from "better-result";
import * as v from "valibot";

/** Narrower than `typeof fetch`, so that tests can pass a plain function. */
export type Fetch = (input: URL, init?: RequestInit) => Promise<Response>;

export class MatomoError extends TaggedError("MatomoError")<{ readonly message: string }> {}

export interface MonthlyVisits {
	/** `yyyy-mm`. */
	month: string;
	visits: number;
	pageViews: number;
}

export interface MatomoClient {
	/** The last `months` months, oldest first, including the current month so far. */
	getMonthlyVisits: (params: { months: number }) => Promise<Result<Array<MonthlyVisits>, MatomoError>>;
}

/** Matomo reports errors with a `200` status, see https://developer.matomo.org/api-reference/reporting-api. */
const ErrorResponseSchema = v.object({
	result: v.literal("error"),
	message: v.string(),
});

const CountSchema = v.optional(v.union([v.number(), v.pipe(v.string(), v.decimal(), v.transform(Number))]), 0);

/** Keyed by month. Months without any visits are an empty array, rather than an object with zeros. */
const MonthlyVisitsResponseSchema = v.record(
	v.pipe(v.string(), v.regex(/^\d{4}-\d{2}$/)),
	v.union([v.object({ nb_visits: CountSchema, nb_pageviews: CountSchema }), v.pipe(v.array(v.unknown()), v.length(0))]),
);

export function createMatomoClient(params: {
	/** E.g. `https://matomo.acdh.oeaw.ac.at`. */
	baseUrl: string;
	siteId: string;
	/** Of a matomo user with view access to the site. */
	token: string;
	fetch?: Fetch;
}): MatomoClient {
	const { baseUrl, siteId, token, fetch = globalThis.fetch } = params;

	return {
		async getMonthlyVisits({ months }) {
			const url = new URL("./index.php", `${baseUrl.replace(/\/$/, "")}/`);

			/** Posted, so that the token is not part of the url, which e.g. proxies log. */
			const body = new URLSearchParams({
				module: "API",
				method: "API.get",
				idSite: siteId,
				period: "month",
				date: `last${String(months)}`,
				showColumns: "nb_visits,nb_pageviews",
				format: "JSON",
				token_auth: token,
			});

			const response = await Result.tryPromise({
				try: () => fetch(url, { method: "POST", body, signal: AbortSignal.timeout(10_000) }),
				catch: (error) => new MatomoError({ message: `Request to matomo failed: ${String(error)}` }),
			});

			if (response.isErr()) {
				return Result.err(response.error);
			}

			if (!response.value.ok) {
				return Result.err(new MatomoError({ message: `Matomo responded with ${String(response.value.status)}.` }));
			}

			const data: unknown = await response.value.json().catch(() => undefined);

			const error = v.safeParse(ErrorResponseSchema, data);

			if (error.success) {
				return Result.err(new MatomoError({ message: `Matomo responded with an error: ${error.output.message}` }));
			}

			const result = v.safeParse(MonthlyVisitsResponseSchema, data);

			if (!result.success) {
				return Result.err(
					new MatomoError({ message: `Unexpected response from matomo: ${v.summarize(result.issues)}` }),
				);
			}

			return Result.ok(
				Object.entries(result.output)
					.map(([month, value]) =>
						Array.isArray(value)
							? { month, visits: 0, pageViews: 0 }
							: { month, visits: value.nb_visits, pageViews: value.nb_pageviews },
					)
					.toSorted((a, z) => a.month.localeCompare(z.month)),
			);
		},
	};
}
