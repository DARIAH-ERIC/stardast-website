import type { APIRoute } from "astro";
import { toXml } from "xast-util-to-xml";

import { config } from "#/src/cms/config.ts";
import { getContentPaths } from "#/src/lib/cms/paths.ts";

/**
 * All pages with content, i.e. not e.g. `/search`. Without `lastmod`: entries have no modification date, and search
 * engines ignore dates which are not accurate.
 */
export const GET: APIRoute = async (context) => {
	const paths = await getContentPaths(config, context.locals.content);

	const xml = toXml({
		type: "root",
		children: [
			{ type: "instruction", name: "xml", value: 'version="1.0" encoding="utf-8"' },
			{
				type: "element",
				name: "urlset",
				attributes: { xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9" },
				children: paths.map((path) => {
					return {
						type: "element",
						name: "url",
						attributes: {},
						children: [
							{
								type: "element",
								name: "loc",
								attributes: {},
								children: [{ type: "text", value: new URL(path, context.site).href }],
							},
						],
					};
				}),
			},
		],
	});

	return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
