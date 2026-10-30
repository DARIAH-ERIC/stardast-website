import { type NVDAPlaywright, nvdaTest as test } from "@guidepup/playwright";
import { expect } from "@playwright/test";

/**
 * Asserts on parts of what nvda says - names, roles, states - rather than on whole phrases, whose wording and order
 * change between nvda versions.
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
			await nvda.navigateNextLandmarkUntil(/legal navigation landmark/i, { maxNavigationAttempts: 12 });
		});

		expect(spoken).toMatch(/banner landmark/i);
		expect(spoken).toMatch(/main navigation landmark/i);
		expect(spoken).toMatch(/main landmark/i);
		expect(spoken).toMatch(/content ?info landmark/i);
		expect(spoken).toMatch(/footer navigation landmark/i);
	});

	test("should move to the main content with the skip link", async ({ page, nvda }) => {
		await page.goto("/");
		await page.getByRole("main").waitFor();
		await nvda.navigateToWebContent();

		await nvda.press("Tab");
		const skipLink = await nvda.lastSpokenPhrase();

		expect(skipLink).toContain("Skip to main content");
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

		expect(firstName).toContain("First name");
		expect(firstName).toMatch(/required/i);
		expect(lastName).toContain("Last name");
		expect(lastName).toMatch(/required/i);
		expect(email).toContain("Email");
		expect(email).toMatch(/required/i);
		/** The notice and privacy policy, via `aria-describedby`. */
		expect(email).toContain("You can unsubscribe at any time.");
		expect(institution).toContain("Institution");
		expect(institution).toContain("optional");
		expect(institution).not.toMatch(/required/i);
		expect(subscribe).toContain("Subscribe");
		expect(subscribe).toMatch(/button/i);
	});

	test("should search the site and announce the results", async ({ page, nvda }) => {
		const query = "STARDAST";

		await page.goto("/search");
		await page.getByRole("search").waitFor();
		await nvda.navigateToWebContent();

		await nvda.navigateNextLandmarkUntil(/search landmark/i);
		await nvda.perform(nvda.keyboardCommands.moveToNextFormField);
		const field = await nvda.lastSpokenPhrase();

		expect(field).toContain("Search the site");
		expect(field).toMatch(/required/i);

		/** Enter switches from browse mode to focus mode, in which keys are typed into the field. */
		await nvda.act();
		await nvda.type(query);
		await nvda.press("Enter");

		const status = page.getByRole("status");
		await expect(status).toContainText(`for "${query}"`);
		await nvda.navigateToWebContent();

		/**
		 * Reads on to the status, rather than waiting for it to be announced on page load - screen readers differ in
		 * whether they announce live regions which are already on a new page. The attached spoken phrases show what nvda
		 * does.
		 */
		await nvda.navigateNextUntil(new RegExp(`results? for "${query}"`), { maxNavigationAttempts: 30 });

		/** Result titles are headings, so that users can move from result to result. */
		await nvda.nextHeading();
		const result = await nvda.lastSpokenPhrase();

		expect(result).toMatch(/heading,? +level 2/i);
		expect(result).toMatch(/link/i);
	});
});
