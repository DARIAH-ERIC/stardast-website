import { siteName } from "#/src/config/project.ts";

/**
 * Schema.org metadata for search engines, as json-ld - see
 * https://developers.google.com/search/docs/appearance/structured-data. Undefined values are left out by
 * `JSON.stringify()`.
 */
export type JsonLd = Record<string, unknown>;

export interface OrganizationReference {
	/** The `@id` of the organization's full description, on the home page. */
	id: string;
	name: string;
	url: string;
}

/** The project, e.g. as publisher of news - described in full on the home page, see `createProjectJsonLd()`. */
export function getProjectReference(site: URL | undefined): OrganizationReference {
	const url = new URL("/", site).href;

	return { id: `${url}#project`, name: siteName, url };
}

export function createProjectJsonLd(
	project: OrganizationReference & {
		description?: string;
		logo: string;
		email?: string;
		/** Profiles on other sites, e.g. linkedin. */
		sameAs: ReadonlyArray<string>;
		funding: { programme: string; grantAgreementNumber: string; funder: { name: string; url: string } };
	},
): JsonLd {
	const funder = { "@type": "Organization", ...project.funding.funder };

	return {
		"@context": "https://schema.org",
		"@type": "ResearchProject",
		"@id": project.id,
		name: project.name,
		url: project.url,
		description: project.description,
		logo: project.logo,
		email: project.email,
		sameAs: project.sameAs.length > 0 ? project.sameAs : undefined,
		funder,
		funding: {
			"@type": "Grant",
			identifier: project.funding.grantAgreementNumber,
			name: `${project.funding.programme} grant agreement No ${project.funding.grantAgreementNumber}`,
			funder,
		},
	};
}

function toOrganization(organization: OrganizationReference): JsonLd {
	return { "@type": "ResearchProject", "@id": organization.id, name: organization.name, url: organization.url };
}

export function createNewsArticleJsonLd(article: {
	url: string;
	headline: string;
	description: string;
	/** An iso date. */
	datePublished: string;
	authors: ReadonlyArray<string>;
	image?: string;
	publisher: OrganizationReference;
}): JsonLd {
	return {
		"@context": "https://schema.org",
		"@type": "NewsArticle",
		mainEntityOfPage: article.url,
		headline: article.headline,
		description: article.description,
		datePublished: article.datePublished,
		author:
			article.authors.length > 0
				? article.authors.map((name) => {
						return { "@type": "Person", name };
					})
				: toOrganization(article.publisher),
		image: article.image,
		publisher: toOrganization(article.publisher),
	};
}

const attendanceModes = {
	inPerson: "https://schema.org/OfflineEventAttendanceMode",
	online: "https://schema.org/OnlineEventAttendanceMode",
	hybrid: "https://schema.org/MixedEventAttendanceMode",
} as const;

export function createEventJsonLd(event: {
	url: string;
	name: string;
	description: string;
	/** Iso dates. */
	startDate: string;
	endDate?: string;
	attendance: keyof typeof attendanceModes;
	/** Where the event takes place in person. */
	location?: string;
	/** E.g. the registration page - also where it takes place online, lacking a better address. */
	website?: string;
	image?: string;
	/** Only when the project organises the event. */
	organizer?: OrganizationReference;
}): JsonLd {
	const place =
		event.attendance !== "online" && event.location != null
			? { "@type": "Place", name: event.location, address: event.location }
			: undefined;
	const virtualLocation =
		event.attendance !== "inPerson" ? { "@type": "VirtualLocation", url: event.website ?? event.url } : undefined;
	const locations = [place, virtualLocation].filter((location) => location != null);

	return {
		"@context": "https://schema.org",
		"@type": "Event",
		url: event.url,
		name: event.name,
		description: event.description,
		startDate: event.startDate,
		endDate: event.endDate ?? event.startDate,
		eventStatus: "https://schema.org/EventScheduled",
		eventAttendanceMode: attendanceModes[event.attendance],
		location: locations.length > 1 ? locations : locations[0],
		image: event.image,
		organizer: event.organizer != null ? toOrganization(event.organizer) : undefined,
	};
}
