/** Derives an entry id from e.g. a title: lowercase ascii letters and digits, separated by single hyphens. */
export function slugify(value: string): string {
	return (
		value
			.normalize("NFKD")
			/** Combining marks, e.g. the diaeresis of a decomposed "ü". */
			.replaceAll(/\p{M}/gu, "")
			.toLowerCase()
			.replaceAll(/[^a-z0-9]+/g, "-")
			.replaceAll(/^-+|-+$/g, "")
	);
}
