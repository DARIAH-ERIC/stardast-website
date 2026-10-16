import { expect, test } from "bun:test";

import { type TrackerCommand, getTrackerCommands } from "#/src/lib/analytics/matomo-tracking.ts";

const tracker = { trackerUrl: "https://matomo.example.org/matomo.php", siteId: "42" };

const setup: Array<TrackerCommand> = [["disableCookies"], ["setTrackerUrl", tracker.trackerUrl], ["setSiteId", "42"]];

test("pages are tracked as page views, without cookies", () => {
	expect(getTrackerCommands({ ...tracker, tracking: { kind: "pageView" } })).toEqual([
		...setup,
		["trackPageView"],
		["enableLinkTracking"],
	]);
});

test("searches are tracked as site searches, at a url without the search terms", () => {
	expect(
		getTrackerCommands({
			...tracker,
			url: "https://example.org/search",
			tracking: { kind: "siteSearch", keyword: "data", category: "News", resultsCount: 3 },
		}),
	).toEqual([
		...setup,
		["setCustomUrl", "https://example.org/search"],
		["trackSiteSearch", "data", "News", 3],
		["enableLinkTracking"],
	]);

	/** E.g. when searching all types, or when the search failed. */
	expect(getTrackerCommands({ ...tracker, tracking: { kind: "siteSearch", keyword: "data" } })).toContainEqual([
		"trackSiteSearch",
		"data",
		false,
		false,
	]);
});

test("pages which are not another visit, e.g. further pages of search results, are not tracked", () => {
	expect(getTrackerCommands({ ...tracker, tracking: { kind: "none" } })).toEqual([...setup, ["enableLinkTracking"]]);
});
