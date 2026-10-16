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

export interface SearchKeyword {
	keyword: string;
	/** The number of visits which searched for it - rather than the number of searches, which one visitor can inflate. */
	visits: number;
}

export interface MatomoClient {
	/** The last `months` months, oldest first, including the current month so far. */
	getMonthlyVisits: (params: { months: number }) => Promise<Result<Array<MonthlyVisits>, MatomoError>>;
	/**
	 * The most searched keywords of the site search over the last `months` months, including the current month so far -
	 * only those of at least `minVisits` visits, so that e.g. a name which someone searched for once is left out.
	 */
	getSearchKeywords: (params: {
		months: number;
		minVisits: number;
		limit: number;
		/** Only searches which found nothing. */
		withoutResults?: boolean;
	}) => Promise<Result<Array<SearchKeyword>, MatomoError>>;
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

/** Keywords which look like numbers may be numbers. */
const SearchKeywordsResponseSchema = v.array(
	v.object({ label: v.union([v.string(), v.pipe(v.number(), v.transform(String))]), nb_visits: CountSchema }),
);

/** `yyyy-mm-dd`, in utc. */
function toIsoDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function createMatomoClient(params: {
	/** E.g. `https://matomo.acdh.oeaw.ac.at`. */
	baseUrl: string;
	siteId: string;
	/** Of a matomo user with view access to the site. */
	token: string;
	fetch?: Fetch;
	now?: () => Date;
}): MatomoClient {
	const { baseUrl, siteId, token, fetch = globalThis.fetch, now = () => new Date() } = params;

	async function request<TSchema extends v.GenericSchema>(
		query: Record<string, string>,
		schema: TSchema,
	): Promise<Result<v.InferOutput<TSchema>, MatomoError>> {
		const url = new URL("./index.php", `${baseUrl.replace(/\/$/, "")}/`);

		/** Posted, so that the token is not part of the url, which e.g. proxies log. */
		const body = new URLSearchParams({
			module: "API",
			idSite: siteId,
			format: "JSON",
			...query,
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

		const result = v.safeParse(schema, data);

		if (!result.success) {
			return Result.err(new MatomoError({ message: `Unexpected response from matomo: ${v.summarize(result.issues)}` }));
		}

		return Result.ok(result.output);
	}

	return {
		async getMonthlyVisits({ months }) {
			const result = await request(
				{ method: "API.get", period: "month", date: `last${String(months)}`, showColumns: "nb_visits,nb_pageviews" },
				MonthlyVisitsResponseSchema,
			);

			return result.map((data) =>
				Object.entries(data)
					.map(([month, value]) =>
						Array.isArray(value)
							? { month, visits: 0, pageViews: 0 }
							: { month, visits: value.nb_visits, pageViews: value.nb_pageviews },
					)
					.toSorted((a, z) => a.month.localeCompare(z.month)),
			);
		},

		async getSearchKeywords({ months, minVisits, limit, withoutResults = false }) {
			const today = now();
			const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (months - 1), 1));

			/** Sorted by visits, so that the first `limit` rows include all of the result. */
			const result = await request(
				{
					method: withoutResults ? "Actions.getSiteSearchNoResultKeywords" : "Actions.getSiteSearchKeywords",
					period: "range",
					date: `${toIsoDate(start)},${toIsoDate(today)}`,
					filter_sort_column: "nb_visits",
					filter_sort_order: "desc",
					filter_limit: String(limit),
				},
				SearchKeywordsResponseSchema,
			);

			return result.map((rows) =>
				rows
					.filter((row) => row.nb_visits >= minVisits)
					.map((row) => {
						return { keyword: row.label, visits: row.nb_visits };
					}),
			);
		},
	};
}
