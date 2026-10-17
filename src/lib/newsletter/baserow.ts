import { Result, TaggedError } from "better-result";
import * as v from "valibot";

/** Narrower than `typeof fetch`, so that tests can pass a plain function. */
export type Fetch = (input: URL, init?: RequestInit) => Promise<Response>;

/** Baserow rejected the email address, e.g. because the table's email field does not accept it. */
export class InvalidSubscriberError extends TaggedError("InvalidSubscriberError")<{ readonly message: string }> {}

export class BaserowError extends TaggedError("BaserowError")<{ readonly message: string }> {}

export interface Subscriber {
	email: string;
	firstName: string;
	lastName: string;
	institution?: string;
}

/**
 * The subscribers table, in database 1450 - its fields are listed with their ids in the database's api docs, see
 * https://baserow.acdh-dev.oeaw.ac.at/api-docs/database/1450. Ids rather than names, so that renaming a field in
 * baserow does not break signups - recreating one does, see `Subscription["unsavedFields"]`. The email address should
 * be an email field, so that baserow validates addresses too.
 *
 * Field ids only exist in their table, so the two are constants together, rather than configurable.
 */
export const subscribersTableId = "5795";

export const subscriberFieldIds = {
	email: "field_49069", // "Email address"
	firstName: "field_49067", // "First name"
	lastName: "field_49064", // "Last name"
	institution: "field_49068", // "Institution"
} as const satisfies Record<keyof Subscriber, string>;

export interface Subscription {
	/**
	 * Fields which baserow did not store as sent - e.g. because a field was deleted, or recreated with a new id, which
	 * baserow does not report as an error, but silently ignores. The row exists nevertheless, so the signup succeeded.
	 */
	unsavedFields: Array<keyof Subscriber>;
}

export interface BaserowClient {
	/** Whether the address is in the subscribers table already, ignoring case. */
	isSubscribed: (email: string) => Promise<Result<boolean, BaserowError>>;
	/** Adds a row to the subscribers table. Addresses already in the table are added again - see `isSubscribed`. */
	subscribe: (subscriber: Subscriber) => Promise<Result<Subscription, InvalidSubscriberError | BaserowError>>;
}

/** See https://api.baserow.io/api/redoc/. */
const ErrorResponseSchema = v.object({
	error: v.optional(v.string()),
	detail: v.optional(v.unknown()),
});

/** The created row, keyed by field id. */
const RowSchema = v.record(v.string(), v.unknown());

const RowsSchema = v.object({ results: v.array(RowSchema) });

export function createBaserowClient(params: {
	/** E.g. `https://baserow.acdh-dev.oeaw.ac.at`, or `https://api.baserow.io` for baserow's hosted service. */
	baseUrl: string;
	/** A database token, with permission to read and create rows in the table. */
	token: string;
	fetch?: Fetch;
}): BaserowClient {
	const { baseUrl, token, fetch = globalThis.fetch } = params;

	const url = new URL(`api/database/rows/table/${subscribersTableId}/`, `${baseUrl.replace(/\/$/, "")}/`);

	return {
		async isSubscribed(email) {
			/**
			 * Baserow's `contains` filter ignores case, which its `equal` filter does not - matches are then compared in
			 * full, since e.g. `ada@example.org` also contains `a@example.org`.
			 */
			const query = new URL(url);
			query.searchParams.set(`filter__${subscriberFieldIds.email}__contains`, email);
			query.searchParams.set("size", "200");

			const response = await Result.tryPromise({
				try: () =>
					fetch(query, {
						headers: { authorization: `Token ${token}` },
						signal: AbortSignal.timeout(10_000),
					}),
				catch: (error) => new BaserowError({ message: `Request to baserow failed: ${String(error)}` }),
			});

			if (response.isErr()) {
				return Result.err(response.error);
			}

			const body: unknown = await response.value.json().catch(() => undefined);

			if (!response.value.ok) {
				const error = v.safeParse(ErrorResponseSchema, body);

				return Result.err(
					new BaserowError({
						message: `Baserow responded with ${String(response.value.status)}: ${(error.success ? error.output.error : undefined) ?? "unknown error"}.`,
					}),
				);
			}

			const rows = v.safeParse(RowsSchema, body);

			if (!rows.success) {
				return Result.err(new BaserowError({ message: "Baserow responded with an unexpected list of rows." }));
			}

			return Result.ok(
				rows.output.results.some((row) => {
					const value = row[subscriberFieldIds.email];

					return typeof value === "string" && value.toLowerCase() === email.toLowerCase();
				}),
			);
		},

		async subscribe(subscriber) {
			const values: Record<keyof Subscriber, string> = {
				email: subscriber.email,
				firstName: subscriber.firstName,
				lastName: subscriber.lastName,
				institution: subscriber.institution ?? "",
			};

			const response = await Result.tryPromise({
				try: () =>
					fetch(url, {
						method: "POST",
						headers: { authorization: `Token ${token}`, "content-type": "application/json" },
						body: JSON.stringify(
							Object.fromEntries(
								Object.entries(values).map(([key, value]) => [subscriberFieldIds[key as keyof Subscriber], value]),
							),
						),
						signal: AbortSignal.timeout(10_000),
					}),
				catch: (error) => new BaserowError({ message: `Request to baserow failed: ${String(error)}` }),
			});

			if (response.isErr()) {
				return Result.err(response.error);
			}

			if (response.value.ok) {
				const row = v.safeParse(RowSchema, await response.value.json().catch(() => undefined));
				const data = row.success ? row.output : {};

				/** Baserow returns empty text fields as `null` or `""`. */
				const unsavedFields = (Object.keys(values) as Array<keyof Subscriber>).filter((key) => {
					const value = data[subscriberFieldIds[key]];

					return (value ?? "") !== values[key];
				});

				return Result.ok({ unsavedFields });
			}

			const body = v.safeParse(ErrorResponseSchema, await response.value.json().catch(() => undefined));
			const error = body.success ? body.output : {};

			/** Validation errors are keyed by field id - only one for the email field is the subscriber's fault. */
			if (
				error.error === "ERROR_REQUEST_BODY_VALIDATION" &&
				typeof error.detail === "object" &&
				error.detail != null &&
				subscriberFieldIds.email in error.detail
			) {
				return Result.err(new InvalidSubscriberError({ message: JSON.stringify(error.detail) }));
			}

			return Result.err(
				new BaserowError({
					message:
						`Baserow responded with ${String(response.value.status)}: ${error.error ?? "unknown error"}. ${error.detail != null ? JSON.stringify(error.detail) : ""}`.trim(),
				}),
			);
		},
	};
}
