/**
 * A placeholder in the title and lead of a partners section, replaced with the number of partners - so that e.g.
 * "{partners} partners from science, the humanities and industry" stays up to date when partners are added.
 */
export const partnerCountPlaceholder = "{partners}";

export function fillPartnerCount(text: string, count: number): string {
	return text.replaceAll(partnerCountPlaceholder, String(count));
}
