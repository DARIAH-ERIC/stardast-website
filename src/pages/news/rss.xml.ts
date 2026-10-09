import type { APIRoute } from "astro";
import { rss } from "xast-util-feed";
import { toXml } from "xast-util-to-xml";

import { locale, siteName } from "#/src/config/project.ts";

const maxItems = 20;

/** The latest news, with their summaries. */
export const GET: APIRoute = async (context) => {
	/** Sorted by publication date, newest first - see the collection's `sort`. */
	const entries = await context.locals.content.list("news");

	const feed = rss(
		{
			title: `${siteName} news`,
			description: `News from ${siteName}.`,
			url: new URL("/news", context.site).href,
			feedUrl: new URL("/news/rss.xml", context.site).href,
			lang: locale,
		},
		entries.slice(0, maxItems).map((entry) => {
			return {
				title: entry.data.title,
				url: new URL(`/news/${entry.id}`, context.site).href,
				description: entry.data.summary,
				published: entry.data.publicationDate,
			};
		}),
	);

	return new Response(toXml(feed), { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
};
