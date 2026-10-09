export const siteName = "STARDAST";

/** The language of all content. */
export const locale = "en-GB";

export interface SocialLink {
	label: string;
	href: string;
	icon: "linkedin";
}

/** Rendered in the site footer only when set. */
// TODO: Add the project contact address.
export const contactEmail: string | null = null;

/** Rendered as icons in the site footer. */
export const socialLinks: ReadonlyArray<SocialLink> = [
	{
		label: "STARDAST on LinkedIn",
		href: "https://www.linkedin.com/company/stardast-stewardship-and-recognition-for-data-science-talent/",
		icon: "linkedin",
	},
];

export const funding = {
	/** Shown in the home hero. */
	programme: "Horizon Europe",
	grantAgreementNumber: "101268773",
	/** Named in the eu disclaimer. */
	grantingAuthority: "the European Commission",
};
