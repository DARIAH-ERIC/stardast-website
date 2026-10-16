import * as path from "node:path";

import { defineConfig } from "oxlint";

import base from "#/configs/oxlint/base.ts";
import playwright from "#/configs/oxlint/playwright.ts";
import regexp from "#/configs/oxlint/regexp.ts";
import tailwindcss, { settings as betterTailwindcssSettings, withEntryPoint } from "#/configs/oxlint/tailwindcss.ts";

const config = defineConfig({
	/**
	 * Every rule is configured explicitly, so no rule may be enabled by the category it happens to belong to. Categories
	 * are not inherited through `extends` either - the entry config's value is used verbatim - so turning them off here
	 * also turns off the ones the shared configs declare.
	 */
	categories: {
		correctness: "off",
		nursery: "off",
		pedantic: "off",
		perf: "off",
		restriction: "off",
		style: "off",
		suspicious: "off",
	},
	extends: [base, playwright, regexp, tailwindcss],
	/** `env` is not inherited through `extends`, so it has to be declared here to have any effect. */
	env: {
		builtin: true,
		browser: true,
	},
	ignorePatterns: [
		/** @see {@link https://github.com/ota-meshi/eslint-plugin-regexp/issues/1033} */
		"**/*.d.ts",
		/** Written by the cms. */
		"content/**",
	],
	options: {
		reportUnusedDisableDirectives: "error",
		typeAware: true,
		typeCheck: true,
	},
	/**
	 * `settings` is not inherited through `extends` - the entry config's value is used verbatim - so the shared configs
	 * export their settings instead of declaring them, and they are composed here.
	 *
	 * Anything resolved against the repository root is also computed here, and deliberately not in the shared config it
	 * belongs to: only this file's location is pinned by oxlint, so it is the one place where `import.meta.dirname`
	 * cannot be invalidated by moving a file around.
	 */
	settings: {
		"better-tailwindcss": {
			...betterTailwindcssSettings,
			cwd: import.meta.dirname,
			entryPoint: path.join(import.meta.dirname, "./src/styles/index.css"),
		},
	},
	overrides: [
		{
			files: ["*.config.ts", "configs/**/*.ts"],
			rules: {
				"import/no-default-export": "off",
			},
		},
		{
			/** The admin ui has its own stylesheet, with intent ui's colour tokens. */
			files: ["src/components/admin/**"],
			rules: withEntryPoint(path.join(import.meta.dirname, "./src/styles/admin.css")),
		},
	],
});

export default config;
