import { type NVDAPlaywright, nvdaTest as test } from "@guidepup/playwright";
import { expect } from "@playwright/test";

/**
 * Asserts on parts of what nvda says - names, roles, states - rather than on whole phrases, whose wording and order
 * change between nvda versions, and between moving by item and by element type. Case-insensitive, since nvda reports
 * text styled with `text-transform: uppercase` in capitals, and punctuation-insensitive, since it leaves out e.g.
 * quotes and puts commas between a landmark's name and its role.
 */

/** What nvda says while `action` runs, which may be several commands. */
async function spokenDuring(nvda: NVDAPlaywright, action: () => Promise<void>): Promise<string> {
	const start = (await nvda.spokenPhraseLog()).length;
	await action();

	return (await nvda.spokenPhraseLog()).slice(start).join("\n");
}

test.describe("nvda", () => {
	/** Attached to the report, to see what went wrong - and to listen in on what users hear. */
	test.afterEach(async ({ nvda }, testInfo) => {
		await testInfo.attach("spoken-phrases.txt", {
			body: (await nvda.spokenPhraseLog()).join("\n"),
			contentType: "text/plain",
		});
	});

	test("should announce the landmarks of a page", async ({ page, nvda }) => {
		await page.goto("/");
		await page.getByRole("main").waitFor();
		await nvda.navigateToWebContent();

		const spoken = await spokenDuring(nvda, async () => {
			await nvda.navigateNextLandmarkUntil(/legal,? navigation landmark/i, { maxNavigationAttempts: 12 });
		});

		expect(spoken).toMatch(/banner landmark/i);
		expect(spoken).toMatch(/main,? navigation landmark/i);
		expect(spoken).toMatch(/main landmark/i);
		expect(spoken).toMatch(/subscribe to our mailing list,? region/i);
		expect(spoken).toMatch(/content ?info landmark/i);
		expect(spoken).toMatch(/footer,? navigation landmark/i);
	});

	test("should move to the main content with the skip link", async ({ page, nvda }) => {
		await page.goto("/");
		await page.getByRole("main").waitFor();
		await nvda.navigateToWebContent();

		/** The first thing on the page, where nvda starts reading. */
		const skipLink = await nvda.lastSpokenPhrase();

		expect(skipLink).toMatch(/skip to main content/i);
		expect(skipLink).toMatch(/link/i);

		const spoken = await spokenDuring(nvda, async () => {
			await nvda.act();
		});

		expect(spoken).toMatch(/main landmark/i);
		await expect(page.getByRole("main")).toBeFocused();
	});

	test("should announce the main heading of a page", async ({ page, nvda }) => {
		await page.goto("/about");
		const heading = page.getByRole("heading", { level: 1 });
		await heading.waitFor();
		await nvda.navigateToWebContent();

		await nvda.perform(nvda.keyboardCommands.moveToNextHeadingLevel1);
		const spoken = await nvda.lastSpokenPhrase();

		expect(spoken).toMatch(/heading,? +level 1/i);
		expect(spoken).toContain(await heading.innerText());
	});

	test("should announce the fields of the mailing list form", async ({ page, nvda }) => {
		await page.goto("/");
		await page.getByRole("main").waitFor();
		await nvda.navigateToWebContent();

		async function nextFormField(): Promise<string> {
			await nvda.perform(nvda.keyboardCommands.moveToNextFormField);

			return nvda.lastSpokenPhrase();
		}

		/** In this order also checks that the honeypot field, after the name fields in the markup, is not reachable. */
		const firstName = await nextFormField();
		const lastName = await nextFormField();
		const email = await nextFormField();
		const institution = await nextFormField();
		const subscribe = await nextFormField();

		expect(firstName).toMatch(/first name/i);
		expect(firstName).toMatch(/required/i);
		expect(lastName).toMatch(/last name/i);
		expect(lastName).toMatch(/required/i);
		expect(email).toMatch(/email/i);
		expect(email).toMatch(/required/i);
		/** The notice and privacy policy, via `aria-describedby`. */
		expect(email).toMatch(/you can unsubscribe at any time/i);
		expect(institution).toMatch(/institution/i);
		expect(institution).toMatch(/optional/i);
		expect(institution).not.toMatch(/required/i);
		expect(subscribe).toMatch(/subscribe/i);
		expect(subscribe).toMatch(/button/i);
	});

	test("should search the site and announce the results", async ({ page, nvda }) => {
		const query = "STARDAST";
		/** Nvda leaves out the quotes around the query. */
		const summary = new RegExp(`\\d+ results? for\\W+${query}`, "i");

		await page.goto("/search");
		await page.getByRole("search").waitFor();
		await nvda.navigateToWebContent();

		await nvda.navigateNextLandmarkUntil(/search landmark/i);
		await nvda.perform(nvda.keyboardCommands.moveToNextFormField);
		const field = await nvda.lastSpokenPhrase();

		expect(field).toMatch(/search the site/i);
		expect(field).toMatch(/required/i);

		/** Enter switches from browse mode to focus mode, in which keys are typed into the field. */
		await nvda.act();
		await nvda.type(query);

		/** Nvda announces the title of the new page, which has the number of results. */
		const loaded = await spokenDuring(nvda, async () => {
			await nvda.press("Enter");
			await page.getByRole("heading", { level: 2, name: summary }).waitFor();
		});

		expect(loaded).toMatch(summary);

		await nvda.navigateToWebContent();

		/** The number of results is a heading, and the results are its subheadings. */
		await nvda.navigateNextHeadingUntil(summary);

		expect(await nvda.lastSpokenPhrase()).toMatch(/heading,? +level 2/i);

		await nvda.nextHeading();
		const result = await nvda.lastSpokenPhrase();

		expect(result).toMatch(/heading,? +level 3/i);
		expect(result).toMatch(/link/i);
	});
});
