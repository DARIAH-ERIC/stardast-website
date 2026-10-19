import * as v from "valibot";

import { siteName } from "#/src/config/project.ts";
import { createMediaCollection } from "#/src/lib/cms/media/collection.ts";
import {
	type InferEntry,
	block,
	collection,
	defineConfig,
	fields,
	optional,
	singleton,
} from "#/src/lib/cms/schema/index.ts";
import { isSafeHref } from "#/src/lib/cms/schema/rich-text.ts";

/** Imported by both the server and the admin ui, so this module must not import server-only code. */

const callout = block({
	label: "Callout",
	fields: {
		tone: fields.select({
			label: "Tone",
			options: [
				{ value: "info", label: "Information" },
				{ value: "warning", label: "Warning" },
			],
			defaultValue: "info",
		}),
		text: fields.textarea({ label: "Text", validation: [v.minLength(1)] }),
	},
});

const figure = block({
	label: "Figure",
	fields: {
		image: fields.image({ label: "Image" }),
		caption: optional(
			fields.textarea({ label: "Caption", description: "Defaults to the caption in the media library." }),
		),
	},
});

/** How the project takes part in an event - used to filter the `/events` listing. */
export const eventInvolvements = [
	{ value: "organised", label: "Organised" },
	{ value: "participatedIn", label: "Participated in" },
	{ value: "supported", label: "Supported" },
] as const;

/** How people take part in an event - also for search engines, see `src/lib/structured-data.ts`. */
export const eventAttendanceModes = [
	{ value: "inPerson", label: "In person" },
	{ value: "online", label: "Online" },
	{ value: "hybrid", label: "In person and online" },
] as const;

/** The kinds of career resources - each listed by a resources section, e.g. on the career resources page. */
export const resourceCategories = [
	{ value: "institutionalAnalysis", label: "Institutional analysis" },
	{ value: "cvExamples", label: "CV examples" },
	{ value: "competencyFrameworks", label: "Competency frameworks" },
] as const;

/** Which listing on the news page a post appears in - `listLabel` names the listing, `label` a post in it. */
export const newsCategories = [
	{ value: "blog", label: "Blog", listLabel: "Blog" },
	{ value: "publication", label: "Publication", listLabel: "Publications" },
	{ value: "pressAndMedia", label: "Press & Media", listLabel: "Press & Media" },
] as const;

const href = fields.text({
	label: "Url",
	description: "A path on this site, e.g. /about, or a full url.",
	validation: [v.check(isSafeHref, "Must be an http(s), mailto, tel, or relative url.")],
});

const link = fields.object({
	label: "Link",
	fields: {
		label: fields.text({ label: "Label", validation: [v.minLength(1)] }),
		href,
	},
});

/** Countries of the eu, and of the eea and horizon europe associated countries. */
const countryCodes = [
	"AL",
	"AM",
	"AT",
	"BA",
	"BE",
	"BG",
	"CH",
	"CY",
	"CZ",
	"DE",
	"DK",
	"EE",
	"ES",
	"FI",
	"FO",
	"FR",
	"GB",
	"GE",
	"GR",
	"HR",
	"HU",
	"IE",
	"IL",
	"IS",
	"IT",
	"LI",
	"LT",
	"LU",
	"LV",
	"MD",
	"ME",
	"MK",
	"MT",
	"NL",
	"NO",
	"PL",
	"PT",
	"RO",
	"RS",
	"SE",
	"SI",
	"SK",
	"TR",
	"UA",
] as const;

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

const countries = countryCodes
	.map((code) => {
		return { value: code, label: countryNames.of(code) ?? code };
	})
	.toSorted((a, b) => a.label.localeCompare(b.label, "en"));

/**
 * Lets a link point to a section, e.g. `/about#partners` - so that related content can stay on one page, rather than
 * being split into sub-pages.
 */
const anchor = optional(
	fields.text({
		label: "Anchor",
		description: "Links to this section with e.g. /about#partners. Must be unique on the page.",
		validation: [
			v.regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, "Must only contain lowercase letters, digits, and single hyphens."),
		],
	}),
);

/** A short label above a section title, e.g. "Vision" above "Our vision". */
const eyebrow = optional(
	fields.text({ label: "Eyebrow", description: "A short line above the title.", validation: [v.maxLength(80)] }),
);

/** The main heading of a page, e.g. "Making data stewardship a recognised profession" on the about page. */
const heading = optional(
	fields.text({
		label: "Heading",
		description:
			"Shown as the main heading, with the title above it. The title still names the page, e.g. in the navigation and the browser tab.",
		validation: [v.maxLength(120)],
	}),
);

/**
 * Sections are the building blocks of the home page, the pages collection, and listing pages - each rendered by one
 * component in `src/components/sections/`. Section titles are level 2 headings, below the page's level 1 heading.
 *
 * Their backgrounds are fixed per section type, rather than chosen by editors, so that pages look consistent.
 */

const textSection = block({
	label: "Text",
	fields: {
		anchor,
		eyebrow,
		layout: fields.select({
			label: "Layout",
			options: [
				{ value: "stacked", label: "Title above the text" },
				{ value: "split", label: "Title beside the text" },
			],
			defaultValue: "stacked",
		}),
		title: optional(fields.text({ label: "Title" })),
		lead: optional(fields.textarea({ label: "Lead", validation: [v.maxLength(500)] })),
		content: fields.richText({
			label: "Content",
			marks: ["bold", "italic", "link", "code"],
			nodes: ["heading", "bulletList", "orderedList", "blockquote"],
			blocks: { callout, figure },
		}),
	},
});

const imageTextSection = block({
	label: "Image and text",
	fields: {
		anchor,
		eyebrow,
		image: fields.image({ label: "Image" }),
		imagePosition: fields.select({
			label: "Image position",
			options: [
				{ value: "start", label: "Before the text" },
				{ value: "end", label: "After the text" },
			],
			defaultValue: "start",
		}),
		title: optional(fields.text({ label: "Title" })),
		content: fields.richText({
			label: "Content",
			marks: ["bold", "italic", "link"],
			nodes: ["bulletList", "orderedList"],
		}),
	},
});

const cardsSection = block({
	label: "Cards",
	fields: {
		anchor,
		eyebrow,
		title: optional(fields.text({ label: "Title" })),
		lead: optional(fields.textarea({ label: "Lead", validation: [v.maxLength(500)] })),
		covers: optional(
			fields.boolean({
				label: "Cover on every card",
				description:
					"Cards without an image show a placeholder, as news do - e.g. for a list of materials. Otherwise only cards with an image show it.",
			}),
		),
		cards: fields.array(
			fields.object({
				label: "Card",
				fields: {
					eyebrow,
					title: fields.text({ label: "Title", validation: [v.minLength(1)] }),
					text: optional(fields.textarea({ label: "Text", validation: [v.maxLength(300)] })),
					image: optional(fields.image({ label: "Image" })),
					href: optional({ ...href, description: "Makes the whole card a link." }),
				},
			}),
			{ label: "Cards", validation: [v.minLength(1)] },
		),
	},
});

const callToActionSection = block({
	label: "Call to action",
	fields: {
		anchor,
		eyebrow,
		title: fields.text({ label: "Title", validation: [v.minLength(1)] }),
		text: optional(fields.textarea({ label: "Text", validation: [v.maxLength(300)] })),
		links: fields.array(link, {
			label: "Links",
			description: "E.g. none while a call is announced, and one to the call once it is open.",
			validation: [v.maxLength(2)],
		}),
	},
});

const newsAndEventsSection = block({
	label: "News and events",
	fields: {
		anchor,
		eyebrow,
		title: fields.text({ label: "Title", validation: [v.minLength(1)] }),
		count: fields.number({
			label: "Number of entries",
			description: "Of the latest news, and of the upcoming events, each.",
			integer: true,
			validation: [v.minValue(1), v.maxValue(6)],
		}),
	},
});

const selectedNewsSection = block({
	label: "Selected news",
	fields: {
		anchor,
		eyebrow,
		title: fields.text({ label: "Title", validation: [v.minLength(1)] }),
		entries: fields.array(fields.reference({ label: "News entry", collection: "news" }), {
			label: "News entries",
			validation: [v.minLength(1), v.maxLength(6)],
		}),
	},
});

/** Lists all partners - the partners themselves are edited in the partners collection. */
const partnersSection = block({
	label: "Partners",
	fields: {
		anchor,
		eyebrow,
		title: fields.text({
			label: "Title",
			description: "{partners} is replaced with the number of partners.",
			validation: [v.minLength(1)],
		}),
		lead: optional(
			fields.textarea({
				label: "Lead",
				description: "{partners} is replaced with the number of partners.",
				validation: [v.maxLength(500)],
			}),
		),
		links: fields.array(link, { label: "Links", validation: [v.maxLength(1)] }),
	},
});

/** E.g. objectives, or work packages - numbered in order, optionally with a prefix, e.g. WP1, WP2. */
const numberedListSection = block({
	label: "Numbered list",
	fields: {
		anchor,
		eyebrow,
		title: optional(fields.text({ label: "Title" })),
		lead: optional(fields.textarea({ label: "Lead", validation: [v.maxLength(500)] })),
		prefix: optional(
			fields.text({
				label: "Number prefix",
				description: "E.g. WP, to number the items WP1, WP2, and so on.",
				validation: [v.maxLength(10)],
			}),
		),
		items: fields.array(
			fields.object({
				label: "Item",
				fields: {
					title: fields.text({ label: "Title", validation: [v.minLength(1)] }),
					text: fields.textarea({ label: "Text", validation: [v.minLength(1), v.maxLength(1000)] }),
				},
			}),
			{ label: "Items", validation: [v.minLength(1)] },
		),
	},
});

/** Lists the resources of one category, newest first - the resources themselves are edited in the resources collection. */
const resourcesSection = block({
	label: "Resources",
	fields: {
		anchor,
		eyebrow,
		title: optional(fields.text({ label: "Title" })),
		lead: optional(fields.textarea({ label: "Lead", validation: [v.maxLength(500)] })),
		category: fields.select({
			label: "Category",
			options: resourceCategories,
			defaultValue: "institutionalAnalysis",
		}),
	},
});

const sections = {
	text: textSection,
	imageText: imageTextSection,
	cards: cardsSection,
	callToAction: callToActionSection,
	numberedList: numberedListSection,
	newsAndEvents: newsAndEventsSection,
	selectedNews: selectedNewsSection,
	partners: partnersSection,
	resources: resourcesSection,
};

export const media = createMediaCollection();

export const home = singleton({
	label: "Home",
	path: "content/home",
	fields: {
		hero: fields.object({
			label: "Hero",
			fields: {
				eyebrow: optional(
					fields.text({
						label: "Eyebrow",
						description: "A short line above the title.",
						validation: [v.maxLength(80)],
					}),
				),
				title: fields.text({ label: "Title", validation: [v.minLength(1)] }),
				lead: fields.textarea({
					label: "Lead",
					description: "Also used by search engines and link previews.",
					validation: [v.minLength(1), v.maxLength(300)],
				}),
				links: fields.array(link, {
					label: "Links",
					description: "The first link is the most prominent.",
					validation: [v.maxLength(2)],
				}),
			},
		}),
		sections: fields.blocks({ label: "Sections", blocks: sections }),
	},
	preview() {
		return "/";
	},
});

/** Top-level routes and public directories, which take precedence over pages with the same id. */
const reservedPageIds = new Set(["404", "500", "admin", "api", "assets", "events", "media", "news", "search"]);

export const pages = collection({
	label: "Pages",
	path: "content/pages",
	slug: { from: "title" },
	id: { validation: [v.check((id) => !reservedPageIds.has(id), "This id is used by a built-in page of the site.")] },
	sort: { field: "title", direction: "asc" },
	fields: {
		title: fields.text({ label: "Title", validation: [v.minLength(1)] }),
		heading,
		summary: optional(
			fields.textarea({
				label: "Summary",
				description: "Shown below the page heading, and used by search engines and link previews.",
				validation: [v.maxLength(300)],
			}),
		),
		sections: fields.blocks({ label: "Sections", blocks: sections }),
	},
	preview(entry) {
		return `/${entry.id}`;
	},
});

export const people = collection({
	label: "People",
	path: "content/people",
	slug: { from: "name" },
	sort: { field: "name", direction: "asc" },
	fields: {
		name: fields.text({ label: "Name", validation: [v.minLength(1)] }),
		affiliation: optional(fields.text({ label: "Affiliation" })),
		email: optional(fields.email({ label: "Email" })),
		website: optional(fields.url({ label: "Website" })),
	},
});

export const news = collection({
	label: "News",
	path: "content/news",
	slug: { from: "title" },
	sort: { field: "publicationDate", direction: "desc" },
	fields: {
		title: fields.text({ label: "Title", validation: [v.minLength(1)] }),
		summary: fields.textarea({ label: "Summary", validation: [v.minLength(1), v.maxLength(300)] }),
		publicationDate: fields.date({ label: "Publication date" }),
		category: fields.select({
			label: "Category",
			description: "Which listing on the news page shows it.",
			options: newsCategories,
			defaultValue: "blog",
		}),
		image: optional(fields.image({ label: "Cover image" })),
		authors: fields.array(fields.reference({ label: "Author", collection: "people" }), { label: "Authors" }),
		content: fields.richText({
			label: "Content",
			marks: ["bold", "italic", "link", "code"],
			nodes: ["heading", "bulletList", "orderedList", "blockquote"],
			blocks: { callout, figure },
		}),
	},
	preview(entry) {
		return `/news/${entry.id}`;
	},
});

export const partners = collection({
	label: "Partners",
	path: "content/partners",
	slug: { from: "name" },
	sort: { field: "name", direction: "asc" },
	fields: {
		name: fields.text({ label: "Name", description: "The full name.", validation: [v.minLength(1)] }),
		shortName: optional(
			fields.text({
				label: "Short name",
				description: "E.g. an acronym, shown after the full name.",
				validation: [v.maxLength(40)],
			}),
		),
		logo: fields.image({
			label: "Logo",
			description: "Shown on a white background. The alternative text should be the partner's name.",
		}),
		url: optional(fields.url({ label: "Website" })),
		linkedin: optional(fields.url({ label: "LinkedIn page" })),
		country: optional(fields.select({ label: "Country", options: countries, defaultValue: "AT" })),
	},
});

/** Resources have no pages of their own - their cards link to where they are published, e.g. on zenodo. */
export const resources = collection({
	label: "Resources",
	path: "content/resources",
	slug: { from: "title" },
	sort: { field: "publicationDate", direction: "desc" },
	fields: {
		title: fields.text({ label: "Title", validation: [v.minLength(1)] }),
		summary: optional(fields.textarea({ label: "Summary", validation: [v.maxLength(300)] })),
		publicationDate: fields.date({ label: "Publication date" }),
		category: fields.select({
			label: "Category",
			description: "Which resources section lists it.",
			options: resourceCategories,
			defaultValue: "institutionalAnalysis",
		}),
		image: optional(fields.image({ label: "Cover image" })),
		href: {
			...href,
			label: "Link",
			description: "Where the resource is published, e.g. its record on Zenodo - or an uploaded pdf, e.g. /media/….",
		},
	},
});

/** Dates are calendar days, without time zone - an event is upcoming until the end of its last day. */
export const events = collection({
	label: "Events",
	path: "content/events",
	slug: { from: "title" },
	sort: { field: "startDate", direction: "desc" },
	fields: {
		title: fields.text({ label: "Title", validation: [v.minLength(1)] }),
		summary: fields.textarea({ label: "Summary", validation: [v.minLength(1), v.maxLength(300)] }),
		startDate: fields.date({ label: "Start date" }),
		endDate: optional(fields.date({ label: "End date", description: "Leave empty for a one-day event." })),
		involvement: fields.select({
			label: "Involvement",
			description: "How STARDAST takes part in the event.",
			options: eventInvolvements,
			defaultValue: "organised",
		}),
		attendance: fields.select({
			label: "Attendance",
			options: eventAttendanceModes,
			defaultValue: "inPerson",
		}),
		location: optional(
			fields.text({ label: "Location", description: "Where the event takes place in person, e.g. Vienna, Austria." }),
		),
		website: optional(fields.url({ label: "Website", description: "E.g. the registration page." })),
		image: optional(fields.image({ label: "Cover image" })),
		content: fields.richText({
			label: "Content",
			marks: ["bold", "italic", "link", "code"],
			nodes: ["heading", "bulletList", "orderedList", "blockquote"],
			blocks: { callout, figure },
		}),
	},
	preview(entry) {
		return `/events/${entry.id}`;
	},
});

/** The editorial content of the `/news` listing - the route and the list itself are owned by code. */
export const newsPage = singleton({
	label: "News page",
	path: "content/news-page",
	fields: {
		title: fields.text({ label: "Title", validation: [v.minLength(1)] }),
		heading,
		intro: optional(
			fields.textarea({
				label: "Intro",
				description: "Shown above the list, and used by search engines and link previews.",
				validation: [v.maxLength(300)],
			}),
		),
		/** No news sections - the page already lists all news. */
		sections: fields.blocks({
			label: "Sections",
			description: "Shown below the list.",
			blocks: { text: textSection, callToAction: callToActionSection },
		}),
	},
	preview() {
		return "/news";
	},
});

/** The editorial content of the `/events` listing - the route and the lists themselves are owned by code. */
export const eventsPage = singleton({
	label: "Events page",
	path: "content/events-page",
	fields: {
		title: fields.text({ label: "Title", validation: [v.minLength(1)] }),
		heading,
		intro: optional(
			fields.textarea({
				label: "Intro",
				description: "Shown above the lists, and used by search engines and link previews.",
				validation: [v.maxLength(300)],
			}),
		),
		/** No news or event sections - the page already lists all events. */
		sections: fields.blocks({
			label: "Sections",
			description: "Shown below the lists.",
			blocks: { text: textSection, callToAction: callToActionSection },
		}),
	},
	preview() {
		return "/events";
	},
});

/** The mailing list signup, shown above the site footer on every page. Subscribers are stored in baserow. */
export const newsletter = singleton({
	label: "Mailing list",
	path: "content/newsletter",
	fields: {
		title: fields.text({ label: "Title", validation: [v.minLength(1)] }),
		text: optional(fields.textarea({ label: "Text", validation: [v.maxLength(300)] })),
		notice: optional(
			fields.textarea({
				label: "Privacy notice",
				description: "Shown below the form, followed by the link to the privacy policy.",
				validation: [v.maxLength(300)],
			}),
		),
		privacyPolicy: optional({
			...href,
			label: "Privacy policy",
			description:
				"E.g. /privacy-policy. Must describe how the data of subscribers is stored, e.g. in baserow, and used.",
		}),
	},
});

/** One level of nesting only: a menu holds links, not other menus. */
const navigationEntries = {
	link: block({ label: "Link", fields: link.fields }),
	menu: block({
		label: "Menu",
		fields: {
			label: fields.text({ label: "Label", validation: [v.minLength(1)] }),
			links: fields.array(link, { label: "Links", validation: [v.minLength(1)] }),
		},
	}),
};

export const navigation = singleton({
	label: "Navigation",
	path: "content/navigation",
	fields: {
		main: fields.blocks({
			label: "Main navigation",
			description: "Shown in the site header, where menus expand to show their links, and in the site footer.",
			blocks: navigationEntries,
		}),
		legal: fields.array(link, {
			label: "Legal navigation",
			description: "Shown in the bottom row of the site footer.",
		}),
	},
});

/** The platforms which can be linked from the site footer - each needs an icon, see `icon.astro`. */
export const socialPlatforms = [
	{ value: "bluesky", label: "Bluesky" },
	{ value: "linkedin", label: "LinkedIn" },
	{ value: "mastodon", label: "Mastodon" },
	{ value: "youtube", label: "YouTube" },
] as const;

export type SocialPlatform = (typeof socialPlatforms)[number]["value"];

/** Site-wide metadata - defaults for pages which do not have their own, and the contact details in the site footer. */
export const site = singleton({
	label: "Site metadata",
	path: "content/site",
	fields: {
		title: optional(
			fields.text({
				label: "Title",
				description: `The home page's title, e.g. in search results and when shared. Defaults to ${siteName}. Other pages are titled e.g. "About | ${siteName}".`,
				validation: [v.maxLength(70)],
			}),
		),
		description: optional(
			fields.textarea({
				label: "Description",
				description:
					"Describes the site in search results and when shared - for the home page, and pages without a summary.",
				validation: [v.maxLength(300)],
			}),
		),
		image: optional(
			fields.image({
				label: "Sharing image",
				description:
					"Shown when a page is shared, e.g. on LinkedIn, unless it has a cover image of its own. Cropped to 1200 × 630 pixels, so it should be at least that large. Must be a jpg, png, or webp image - platforms do not show svg images.",
			}),
		),
		contactEmail: optional(fields.email({ label: "Contact email", description: "Shown in the site footer." })),
		socialLinks: fields.array(
			fields.object({
				label: "Social link",
				fields: {
					platform: fields.select({ label: "Platform", options: socialPlatforms, defaultValue: "linkedin" }),
					url: fields.url({ label: "Url", description: "The profile's full url." }),
				},
			}),
			{ label: "Social links", description: "Shown as icons in the site footer." },
		),
	},
});

export const config = defineConfig({
	collections: { events, media, news, pages, partners, people, resources },
	singletons: { eventsPage, home, navigation, newsPage, newsletter, site },
});

/** The collection name of the media library, see `createMediaCollection()`. */
export const mediaCollectionName = "media";

export type CmsConfig = typeof config;

export type NewsEntryData = InferEntry<typeof news>;

export type EventEntryData = InferEntry<typeof events>;

export type PersonEntryData = InferEntry<typeof people>;

export type ResourceEntryData = InferEntry<typeof resources>;

export type MediaEntryData = InferEntry<typeof media>;

export type HomeData = InferEntry<typeof home>;

export type NavigationData = InferEntry<typeof navigation>;

export type PageEntryData = InferEntry<typeof pages>;

export type SectionsData = PageEntryData["sections"];

export type SectionData<TType extends SectionsData[number]["type"]> = Extract<
	SectionsData[number],
	{ type: TType }
>["data"];
