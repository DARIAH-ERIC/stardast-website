import { expect, test } from "bun:test";

import { type Fetch, createBaserowClient, subscriberFieldIds } from "#/src/lib/newsletter/baserow.ts";

const subscriber = { email: "ada@example.org", firstName: "Ada", lastName: "Lovelace" };

/** Baserow's response to creating a row: the row, with all of the table's fields - here, with what was sent. */
function echo(_url: URL, init?: RequestInit): Response {
	return Response.json({ id: 1, order: "1.00000000000000000000", ...JSON.parse(init?.body as string) });
}

function createClient(respond: (url: URL, init?: RequestInit) => Response) {
	const requests: Array<{ url: URL; init?: RequestInit }> = [];

	const fetch: Fetch = (url, init) => {
		requests.push({ url, init });

		return Promise.resolve(respond(url, init));
	};

	const client = createBaserowClient({ baseUrl: "https://baserow.example.org/", token: "secret", fetch });

	return { client, requests };
}

test("adds a row to the subscribers table, by field id", async () => {
	const { client, requests } = createClient(echo);

	const result = await client.subscribe({ ...subscriber, institution: "University of Vienna" });

	expect(result.isOk() && result.value).toEqual({ unsavedFields: [] });
	expect(requests).toHaveLength(1);
	expect(requests[0]!.url.href).toBe("https://baserow.example.org/api/database/rows/table/5795/");
	expect(requests[0]!.init?.method).toBe("POST");
	expect(new Headers(requests[0]!.init?.headers).get("authorization")).toBe("Token secret");
	expect(JSON.parse(requests[0]!.init?.body as string)).toEqual({
		[subscriberFieldIds.email]: "ada@example.org",
		[subscriberFieldIds.firstName]: "Ada",
		[subscriberFieldIds.lastName]: "Lovelace",
		[subscriberFieldIds.institution]: "University of Vienna",
	});
});

test("leaves the institution empty when not given, which baserow may return as null", async () => {
	const { client, requests } = createClient((_url, init) =>
		Response.json({ ...JSON.parse(init?.body as string), [subscriberFieldIds.institution]: null }),
	);

	const result = await client.subscribe(subscriber);

	expect(JSON.parse(requests[0]!.init?.body as string)).toMatchObject({ [subscriberFieldIds.institution]: "" });
	expect(result.isOk() && result.value).toEqual({ unsavedFields: [] });
});

test("reports fields which baserow did not store, e.g. because they were deleted from the table", async () => {
	const { client } = createClient((_url, init) => {
		const { [subscriberFieldIds.firstName]: _deleted, ...row } = JSON.parse(init?.body as string) as Record<
			string,
			unknown
		>;

		return Response.json({ ...row, [subscriberFieldIds.lastName]: "Lovelac" });
	});

	const result = await client.subscribe(subscriber);

	expect(result.isOk() && result.value).toEqual({ unsavedFields: ["firstName", "lastName"] });
});

test("rejects email addresses which the table's email field does not accept", async () => {
	const { client } = createClient(() =>
		Response.json(
			{
				error: "ERROR_REQUEST_BODY_VALIDATION",
				detail: { [subscriberFieldIds.email]: [{ error: "Enter a valid email address.", code: "invalid" }] },
			},
			{ status: 400 },
		),
	);

	const result = await client.subscribe(subscriber);

	expect(result.isErr() && result.error._tag).toBe("InvalidSubscriberError");
});

test("fails on validation errors of other fields, which are a misconfigured table", async () => {
	const { client } = createClient(() =>
		Response.json(
			{
				error: "ERROR_REQUEST_BODY_VALIDATION",
				detail: {
					[subscriberFieldIds.firstName]: [
						{ error: "Ensure this field has no more than 50 characters.", code: "max_length" },
					],
				},
			},
			{ status: 400 },
		),
	);

	const result = await client.subscribe(subscriber);

	expect(result.isErr() && result.error._tag).toBe("BaserowError");
});

test("fails on other errors, e.g. an invalid token", async () => {
	const { client } = createClient(() =>
		Response.json(
			{ error: "ERROR_TOKEN_DOES_NOT_EXIST", detail: "The provided token does not exist." },
			{ status: 401 },
		),
	);

	const result = await client.subscribe(subscriber);

	expect(result.isErr() && result.error._tag).toBe("BaserowError");
	expect(result.isErr() && result.error.message).toContain("401");
	expect(result.isErr() && result.error.message).toContain("ERROR_TOKEN_DOES_NOT_EXIST");
});

test("fails when baserow cannot be reached", async () => {
	const client = createBaserowClient({
		baseUrl: "https://baserow.example.org",
		token: "secret",
		fetch: () => Promise.reject(new TypeError("fetch failed")),
	});

	const result = await client.subscribe(subscriber);

	expect(result.isErr() && result.error._tag).toBe("BaserowError");
});

test("finds subscribed addresses, ignoring case", async () => {
	const { client, requests } = createClient(() =>
		Response.json({
			count: 2,
			results: [{ [subscriberFieldIds.email]: "lada@example.org" }, { [subscriberFieldIds.email]: "Ada@Example.org" }],
		}),
	);

	const result = await client.isSubscribed("ada@example.org");

	expect(result.isOk() && result.value).toBe(true);
	expect(requests[0]!.url.searchParams.get(`filter__${subscriberFieldIds.email}__contains`)).toBe("ada@example.org");
	expect(new Headers(requests[0]!.init?.headers).get("authorization")).toBe("Token secret");
});

test("does not count addresses which only contain the address as subscribed", async () => {
	const { client } = createClient(() =>
		Response.json({ count: 1, results: [{ [subscriberFieldIds.email]: "lada@example.org" }] }),
	);

	const result = await client.isSubscribed("ada@example.org");

	expect(result.isOk() && result.value).toBe(false);
});

test("fails to check for subscribed addresses without permission to read rows", async () => {
	const { client } = createClient(() =>
		Response.json(
			{ error: "ERROR_NO_PERMISSION_TO_TABLE", detail: "The token does not have permissions to the table." },
			{ status: 401 },
		),
	);

	const result = await client.isSubscribed("ada@example.org");

	expect(result.isErr() && result.error.message).toContain("ERROR_NO_PERMISSION_TO_TABLE");
});
