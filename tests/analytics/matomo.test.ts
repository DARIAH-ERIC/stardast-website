import { expect, test } from "bun:test";

import { type Fetch, createMatomoClient } from "#/src/lib/analytics/matomo.ts";

function createClient(respond: (url: URL, init?: RequestInit) => Response) {
	const requests: Array<{ url: URL; init?: RequestInit }> = [];

	const fetch: Fetch = (url, init) => {
		requests.push({ url, init });

		return Promise.resolve(respond(url, init));
	};

	const client = createMatomoClient({ baseUrl: "https://matomo.example.org/", siteId: "42", token: "secret", fetch });

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
