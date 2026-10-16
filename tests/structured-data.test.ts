import { expect, test } from "bun:test";

import { createEventJsonLd, getProjectReference } from "#/src/lib/structured-data.ts";

const site = new URL("https://example.org");

const event = {
	url: "https://example.org/events/workshop",
	name: "Workshop",
	description: "A workshop.",
	startDate: "2027-03-05",
};

test("events are located by how people attend", () => {
	const inPerson = createEventJsonLd({ ...event, attendance: "inPerson", location: "Vienna, Austria" });

	expect(inPerson.eventAttendanceMode).toBe("https://schema.org/OfflineEventAttendanceMode");
	expect(inPerson.location).toEqual({ "@type": "Place", name: "Vienna, Austria", address: "Vienna, Austria" });

	const online = createEventJsonLd({ ...event, attendance: "online", website: "https://example.org/register" });

	expect(online.eventAttendanceMode).toBe("https://schema.org/OnlineEventAttendanceMode");
	expect(online.location).toEqual({ "@type": "VirtualLocation", url: "https://example.org/register" });

	const hybrid = createEventJsonLd({ ...event, attendance: "hybrid", location: "Vienna, Austria" });

	expect(hybrid.eventAttendanceMode).toBe("https://schema.org/MixedEventAttendanceMode");
	expect(hybrid.location).toEqual([
		{ "@type": "Place", name: "Vienna, Austria", address: "Vienna, Austria" },
		{ "@type": "VirtualLocation", url: event.url },
	]);
});

test("one-day events end on the day they start, and only organised events name an organizer", () => {
	const visited = createEventJsonLd({ ...event, attendance: "inPerson" });

	expect(visited.endDate).toBe("2027-03-05");
	expect(visited.organizer).toBeUndefined();

	const organised = createEventJsonLd({ ...event, attendance: "inPerson", organizer: getProjectReference(site) });

	expect(organised.organizer).toEqual({
		"@type": "ResearchProject",
		"@id": "https://example.org/#project",
		name: "STARDAST",
		url: "https://example.org/",
	});
});
