import { expect, test } from "bun:test";

import { type Fetch, createMatomoClient } from "#/src/lib/analytics/matomo.ts";

function createClient(respond: (url: URL, init?: RequestInit) => Response) {
	const requests: Array<{ url: URL; init?: RequestInit }> = [];

	const fetch: Fetch = (url, init) => {
		requests.push({ url, init });

		return Promise.resolve(respond(url, init));
	};

	const client = createMatomoClient({
		baseUrl: "https://matomo.example.org/",
		siteId: "42",
		token: "secret",
		fetch,
		now: () => new Date("2026-10-16T12:00:00Z"),
	});

	return { client, requests };
}

test("posts the token, rather than sending it in the url", async () => {
	const { client, requests } = createClient(() => Response.json({}));

	await client.getMonthlyVisits({ months: 12 });

	expect(requests).toHaveLength(1);
	expect(requests[0]!.url.href).toBe("https://matomo.example.org/index.php");
	expect(requests[0]!.init?.method).toBe("POST");
	expect(Object.fromEntries(requests[0]!.init?.body as URLSearchParams)).toMatchObject({
		module: "API",
		method: "API.get",
		idSite: "42",
		period: "month",
		date: "last12",
		format: "JSON",
		token_auth: "secret",
	});
});

test("returns visits and page views per month, oldest first, with zeros for months without visits", async () => {
	const { client } = createClient(() =>
		Response.json({
			"2026-10": { nb_visits: 120, nb_pageviews: 340 },
			"2026-08": [],
			"2026-09": { nb_visits: "95", nb_pageviews: "210" },
		}),
	);

	const result = await client.getMonthlyVisits({ months: 3 });

	expect(result.isOk() && result.value).toEqual([
		{ month: "2026-08", visits: 0, pageViews: 0 },
		{ month: "2026-09", visits: 95, pageViews: 210 },
		{ month: "2026-10", visits: 120, pageViews: 340 },
	]);
});

test("reports errors, which matomo responds with as 200", async () => {
	const { client } = createClient(() =>
		Response.json({ result: "error", message: "You can't access this resource as it requires 'view' access." }),
	);

	const result = await client.getMonthlyVisits({ months: 12 });

	expect(result.isErr() && result.error.message).toContain("requires 'view' access");
});

test("reports unexpected responses", async () => {
	const { client } = createClient(() => Response.json({ value: 1 }));

	const result = await client.getMonthlyVisits({ months: 12 });

	expect(result.isErr() && result.error._tag).toBe("MatomoError");
});

test("reports failed requests", async () => {
	const { client } = createClient(() => new Response("Bad gateway", { status: 502 }));

	const result = await client.getMonthlyVisits({ months: 12 });

	expect(result.isErr() && result.error.message).toBe("Matomo responded with 502.");
});

test("returns search keywords of at least the minimum number of visits, over whole months", async () => {
	const { client, requests } = createClient(() =>
		Response.json([
			{ label: "data stewardship", nb_visits: 7, nb_hits: 9 },
			{ label: 2027, nb_visits: "3" },
			{ label: "jane doe", nb_visits: 2, nb_hits: 5 },
		]),
	);

	const result = await client.getSearchKeywords({ months: 12, minVisits: 3, limit: 20 });

	expect(result.isOk() && result.value).toEqual([
		{ keyword: "data stewardship", visits: 7 },
		{ keyword: "2027", visits: 3 },
	]);
	expect(Object.fromEntries(requests[0]!.init?.body as URLSearchParams)).toMatchObject({
		method: "Actions.getSiteSearchKeywords",
		period: "range",
		date: "2025-11-01,2026-10-16",
		filter_sort_column: "nb_visits",
		filter_sort_order: "desc",
		filter_limit: "20",
	});
});

test("returns searches without results from their own report", async () => {
	const { client, requests } = createClient(() => Response.json([]));

	const result = await client.getSearchKeywords({ months: 1, minVisits: 3, limit: 20, withoutResults: true });

	expect(result.isOk() && result.value).toEqual([]);
	expect(Object.fromEntries(requests[0]!.init?.body as URLSearchParams)).toMatchObject({
		method: "Actions.getSiteSearchNoResultKeywords",
		date: "2026-10-01,2026-10-16",
	});
});
