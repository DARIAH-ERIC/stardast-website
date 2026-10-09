import * as v from "valibot";

/**
 * Validation messages for editors, registered for a separate valibot language - so that other validation, e.g. of
 * environment variables, keeps valibot's more technical messages. Pass `{ lang: editorMessagesLang }` to parse.
 */
export const editorMessagesLang = "en-cms-editor";

v.setSchemaMessage(
	(issue) =>
		issue.received === "undefined" || issue.received === '""' ? "Required." : `Must be ${String(issue.expected)}.`,
	editorMessagesLang,
);

v.setSpecificMessage(
	v.minLength,
	(issue) =>
		issue.requirement === 1 ? "Required." : `Must have at least ${String(issue.requirement)} characters or items.`,
	editorMessagesLang,
);

v.setSpecificMessage(
	v.maxLength,
	(issue) => `Must have at most ${String(issue.requirement)} characters or items.`,
	editorMessagesLang,
);

v.setSpecificMessage(v.nonEmpty, () => "Required.", editorMessagesLang);
v.setSpecificMessage(v.email, () => "Must be an email address.", editorMessagesLang);
v.setSpecificMessage(v.url, () => "Must be a url, e.g. https://example.org.", editorMessagesLang);
v.setSpecificMessage(v.isoDate, () => "Must be a date.", editorMessagesLang);
v.setSpecificMessage(v.isoTimestamp, () => "Must be a date and time.", editorMessagesLang);
v.setSpecificMessage(v.integer, () => "Must be a whole number.", editorMessagesLang);
v.setSpecificMessage(v.picklist, () => "Select one of the options.", editorMessagesLang);
