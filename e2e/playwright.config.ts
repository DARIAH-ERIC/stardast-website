import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";
import isInCi from "is-in-ci";
import * as v from "valibot";

import { loadEnvFiles } from "#/configs/env.files.ts";
import { client } from "#/configs/env.schema.ts";

const projectDir = fileURLToPath(new URL("..", import.meta.url));

/** Loads the same `.env` files as the astro config, so this sees what the dev server started by `webServer` sees. */
loadEnvFiles();

const env = v.parse(v.pick(client, ["PUBLIC_APP_BASE_URL"]), process.env);

export default defineConfig({
	expect: {
		toMatchAriaSnapshot: {
			pathTemplate: "{testDir}/snapshots/{testFilePath}-snapshots/{arg}{ext}",
		},
	},
	forbidOnly: isInCi,
	fullyParallel: true,
	maxFailures: isInCi ? 10 : 0,
	reporter: isInCi ? "github" : "html",
	retries: isInCi ? 2 : 0,
	snapshotPathTemplate: "{testDir}/snapshots/{testFilePath}-snapshots/{arg}{-projectName}{-platform}{ext}",
	testDir: ".",
	/** Need a screen reader, see `./nvda.config.ts`. */
	testIgnore: "nvda/**",
	timeout: 30_000,
	use: {
		baseURL: env.PUBLIC_APP_BASE_URL,
		screenshot: "on-first-failure",
		trace: "on-first-retry",
	},
	webServer: isInCi
		? undefined
		: {
				command: "bun run dev",
				cwd: projectDir,
				reuseExistingServer: true,
				url: env.PUBLIC_APP_BASE_URL,
			},
	workers: isInCi ? 1 : undefined,
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"], channel: "chrome" },
		},
		{
			name: "firefox",
			use: { ...devices["Desktop Firefox"] },
		},
		{
			name: "webkit",
			use: { ...devices["Desktop Safari"] },
		},
	],
});
