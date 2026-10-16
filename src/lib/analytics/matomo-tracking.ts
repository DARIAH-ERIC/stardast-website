/**
 * What a page reports to matomo - a page view by default. `url` replaces the page's own url, e.g. to leave out search
 * terms, which a site search reports separately.
 */
export type PageTracking = { url?: string } & (
	| { kind: "pageView" }
	/** Reported instead of a page view, see https://matomo.org/faq/reports/tracking-site-search-keywords/. */
	| { kind: "siteSearch"; keyword: string; category?: string; resultsCount?: number }
	/** E.g. a further page of the same search results, which is not another search. */
	| { kind: "none" }
);

export type TrackerCommand = [string, ...Array<boolean | number | string>];

/** Commands for matomo's javascript tracker, see https://developer.matomo.org/api-reference/tracking-javascript. */
export function getTrackerCommands(params: {
	trackerUrl: string;
	siteId: string;
	/** An absolute url. */
	url?: string;
	tracking: PageTracking;
}): Array<TrackerCommand> {
	const { trackerUrl, siteId, url, tracking } = params;

	/** Without cookies, so that no consent is needed - returning visitors are only recognised within a day. */
	const commands: Array<TrackerCommand> = [["disableCookies"], ["setTrackerUrl", trackerUrl], ["setSiteId", siteId]];

	if (url != null) {
		commands.push(["setCustomUrl", url]);
	}

	switch (tracking.kind) {
		case "pageView": {
			commands.push(["trackPageView"]);
			break;
		}
		case "siteSearch": {
			/** `false` leaves out an optional argument. */
			commands.push(["trackSiteSearch", tracking.keyword, tracking.category ?? false, tracking.resultsCount ?? false]);
			break;
		}
		case "none": {
			break;
		}
	}

	commands.push(["enableLinkTracking"]);

	return commands;
}
