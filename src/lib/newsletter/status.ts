/** The outcome of a mailing list signup, passed back to the page the form is on, see `/api/newsletter`. */
export const newsletterStatuses = ["subscribed", "invalid", "error"] as const;

export type NewsletterStatus = (typeof newsletterStatuses)[number];

export const newsletterStatusParam = "newsletter";

/** The signup form's element id, which the redirect scrolls back to. */
export const newsletterFormId = "newsletter";

export function getNewsletterStatus(url: URL): NewsletterStatus | undefined {
	const value = url.searchParams.get(newsletterStatusParam);

	return newsletterStatuses.find((status) => status === value);
}
