import type { APIRoute } from "astro";
import * as v from "valibot";

import { env } from "#/configs/env.config.ts";
import { getSafeReturnTo } from "#/src/lib/cms/auth/return-to.ts";
import { createBaserowClient } from "#/src/lib/newsletter/baserow.ts";
import { type NewsletterStatus, newsletterFormId, newsletterStatusParam } from "#/src/lib/newsletter/status.ts";

const FormSchema = v.object({
	firstName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
	lastName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
	email: v.pipe(v.string(), v.trim(), v.email(), v.maxLength(254)),
	institution: v.optional(
		v.pipe(
			v.string(),
			v.trim(),
			v.maxLength(200),
			v.transform((value) => (value === "" ? undefined : value)),
		),
	),
});

/**
 * Subscribes to the mailing list. A plain form post, which redirects back to the page the form is on, with the outcome
 * in the query - so that it works without javascript.
 */
export const POST: APIRoute = async (context) => {
	const form = await context.request.formData().catch(() => undefined);
	const fields = Object.fromEntries(
		[...(form?.entries() ?? [])].filter((entry): entry is [string, string] => typeof entry[1] === "string"),
	);

	function redirect(status: NewsletterStatus): Response {
		const url = new URL(getSafeReturnTo(fields.returnTo, "/"), context.url);
		url.searchParams.set(newsletterStatusParam, status);
		url.hash = newsletterFormId;

		return context.redirect(url.pathname + url.search + url.hash, 303);
	}

	/** A honeypot: hidden from people, but filled in by bots. Pretends to succeed, so they do not retry. */
	if (fields.website != null && fields.website !== "") {
		return redirect("subscribed");
	}

	const result = v.safeParse(FormSchema, fields);

	if (!result.success) {
		return redirect("invalid");
	}

	if (env.BASEROW_TOKEN == null) {
		context.logger.error("Mailing list signup failed: BASEROW_TOKEN is not configured.");

		return redirect("error");
	}

	const baserow = createBaserowClient({
		baseUrl: env.BASEROW_API_BASE_URL,
		token: env.BASEROW_TOKEN,
	});

	const subscription = await baserow.subscribe(result.output);

	if (subscription.isErr()) {
		if (subscription.error._tag === "InvalidSubscriberError") {
			return redirect("invalid");
		}

		context.logger.error(`Mailing list signup failed: ${subscription.error.message}`);

		return redirect("error");
	}

	/** The visitor is subscribed either way - an error would only make them sign up again. */
	if (subscription.value.unsavedFields.length > 0) {
		context.logger.error(
			`Mailing list signup stored incompletely - check the baserow table's fields: ${subscription.value.unsavedFields.join(", ")}.`,
		);
	}

	return redirect("subscribed");
};
