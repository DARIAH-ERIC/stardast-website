import { expect, test } from "bun:test";

import { type Fetch, createZenodoClient, summarize } from "#/src/lib/zenodo.ts";

/** A record as zenodo's search responses list it, without what the site does not use. */
function record(id: number, keywords?: Array<string>) {
	return {
		id,
		links: { self_html: `https://zenodo.org/records/${String(id)}` },
		metadata: {
			title: `Record ${String(id)}`,
			publication_date: "2026-10-01",
			description: "<p>A description.</p>",
			...(keywords != null && { keywords }),
		},
	};
}

function createClient(respond: (url: URL) => Response, maxPages?: number) {
	const requests: Array<URL> = [];

	const fetch: Fetch = (url) => {
		requests.push(url);

		return Promise.resolve(respond(url));
	};

	const client = createZenodoClient({ baseUrl: "https://zenodo.example.org/", maxPages, fetch });

	return { client, requests };
}

test("lists the records of a community, following the links to further pages", async () => {
	const { client, requests } = createClient((url) =>
		url.searchParams.get("page") === "2"
			? Response.json({ hits: { hits: [record(3)] }, links: {} })
			: Response.json({
					hits: { hits: [record(1, ["CV example"]), record(2)] },
					links: { next: "https://zenodo.example.org/api/communities/stardast/records?page=2&size=25&sort=newest" },
				}),
	);

	const result = await client.listCommunityRecords("stardast");

	expect(requests.map((url) => url.href)).toEqual([
		"https://zenodo.example.org/api/communities/stardast/records?size=25&sort=newest",
		"https://zenodo.example.org/api/communities/stardast/records?page=2&size=25&sort=newest",
	]);
	expect(result.isOk() && result.value).toEqual([
		{
			id: "1",
			title: "Record 1",
			publicationDate: "2026-10-01",
			description: "<p>A description.</p>",
			keywords: ["CV example"],
			url: "https://zenodo.org/records/1",
		},
		expect.objectContaining({ id: "2", keywords: [] }),
		expect.objectContaining({ id: "3" }),
	]);
});

test("stops after the maximum number of pages", async () => {
	const { client, requests } = createClient((url) => {
		const page = Number(url.searchParams.get("page") ?? "1");

		return Response.json({
			hits: { hits: [record(page)] },
			links: { next: `https://zenodo.example.org/api/communities/stardast/records?page=${String(page + 1)}` },
		});
	}, 2);

	const result = await client.listCommunityRecords("stardast");

	expect(requests).toHaveLength(2);
	expect(result.isOk() && result.value.map((item) => item.id)).toEqual(["1", "2"]);
});

test("fails for error responses, unexpected responses, and failed requests", async () => {
	const notFound = await createClient(() =>
		Response.json({ status: 404 }, { status: 404 }),
	).client.listCommunityRecords("stardast");
	expect(notFound.isErr() && notFound.error.message).toContain("404");

	const unexpected = await createClient(() => Response.json({ hits: [] })).client.listCommunityRecords("stardast");
	expect(unexpected.isErr() && unexpected.error.message).toContain("unexpected");

	const { client } = createClient(() => {
		throw new Error("offline");
	});
	const failed = await client.listCommunityRecords("stardast");
	expect(failed.isErr() && failed.error.message).toContain("offline");
});

test("summarizes a description as plain text", () => {
	expect(summarize("<p>Data stewards&nbsp;&amp; their <em>careers</em>.</p><p>Second&#8217;s &#x2014; para.</p>")).toBe(
		"Data stewards & their careers. Second’s — para.",
	);
	expect(summarize("<script>alert(1)</script>")).toBe("alert(1)");
});

test("shortens long descriptions at a word boundary", () => {
	const summary = summarize(`<p>${"word ".repeat(100)}</p>`, 50);

	expect(summary.length).toBeLessThanOrEqual(50);
	expect(summary).toEndWith("word…");
});
