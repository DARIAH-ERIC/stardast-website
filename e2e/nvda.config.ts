import { fileURLToPath } from "node:url";

import { withGuidepup } from "@guidepup/playwright";
import { devices } from "@playwright/test";
import isInCi from "is-in-ci";
import * as v from "valibot";

import { loadEnvFiles } from "#/configs/env.files.ts";
import { client } from "#/configs/env.schema.ts";

const projectDir = fileURLToPath(new URL("..", import.meta.url));

loadEnvFiles();

const env = v.parse(v.pick(client, ["PUBLIC_APP_BASE_URL"]), process.env);

/**
 * Screen reader tests with nvda, which only runs on windows - see `.github/workflows/screen-reader.yaml`. Needs a
 * machine set up with `@guidepup/setup`, since guidepup drives nvda via its own add-on.
 *
 * `withGuidepup` runs tests one at a time, in a headed browser: there is only one screen reader per machine, and it
 * only reads what is in the foreground.
 */
export default withGuidepup({
	forbidOnly: isInCi,
	reporter: isInCi ? [["github"], ["html", { open: "never" }]] : "html",
	/** Screen readers are slower than the dom, and occasionally miss a key press. */
	reportSlowTests: null,
	retries: isInCi ? 2 : 0,
	testDir: "./nvda",
	timeout: 5 * 60_000,
	use: {
		baseURL: env.PUBLIC_APP_BASE_URL,
		screenshot: "on-first-failure",
		trace: "on-first-retry",
	},
	/** Unlike `./playwright.config.ts` also in ci, since the screen reader job runs on its own windows runner. */
	webServer: {
		command: "bun run dev",
		cwd: projectDir,
		reuseExistingServer: !isInCi,
		timeout: 5 * 60_000,
		url: env.PUBLIC_APP_BASE_URL,
	},
	/** Nvda with chrome is the most common screen reader and browser combination. */
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"], channel: "chrome" },
		},
	],
});
