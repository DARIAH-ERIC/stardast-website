import type { APIRoute } from "astro";
import { rss } from "xast-util-feed";
import { toXml } from "xast-util-to-xml";

import { locale, siteName } from "#/src/config/project.ts";
import { formatDateRange } from "#/src/lib/format-date.ts";

const maxItems = 20;

/**
 * The events with the latest start dates, upcoming ones included. Items have no `pubDate`: events have no publication
 * date, and their start date would be in the future, which some feed readers hide until then. Readers show new items
 * when they first see them instead. The dates and location lead the description.
 */
export const GET: APIRoute = async (context) => {
	/** Sorted by start date, latest first - see the collection's `sort`. */
	const entries = await context.locals.content.list("events");

	const feed = rss(
		{
			title: `${siteName} events`,
			description: `Events organised, attended or supported by ${siteName}.`,
			url: new URL("/events", context.site).href,
			feedUrl: new URL("/events/rss.xml", context.site).href,
			lang: locale,
		},
		entries.slice(0, maxItems).map((entry) => {
			const { title, summary, startDate, endDate, location } = entry.data;

			return {
				title,
				url: new URL(`/events/${entry.id}`, context.site).href,
				description: [formatDateRange(startDate, endDate), location, summary]
					.filter((value) => value != null)
					.join(" · "),
			};
		}),
	);

	return new Response(toXml(feed), { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
};
