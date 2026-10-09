import { getDefaultSelectors } from "eslint-plugin-better-tailwindcss/defaults";
import { defineConfig } from "oxlint";

/**
 * Settings are _not_ inherited through `extends` - the entry config's `settings` is used verbatim. Exported here so
 * `oxlint.config.ts` can compose them; declaring a `settings` key in this file would be silently dropped.
 */
export const settings = {
	/**
	 * Custom selectors replace the plugin's defaults rather than adding to them - without the defaults, e.g. `className`
	 * attributes, and `tv()` or `twMerge()` calls, are not linted at all.
	 */
	selectors: [
		...getDefaultSelectors(),
		{
			kind: "callee",
			name: "^cn$",
			match: [{ type: "strings" }, { type: "objectValues" }],
		},
		{
			kind: "callee",
			name: "^styles$",
			match: [
				{ type: "strings" },
				{ type: "objectValues", path: "^base$" },
				{ type: "objectValues", path: "^variants.*$" },
				{ type: "objectValues", path: "^combinations\\[\\d+\\]\\[1\\]$" },
			],
		},
	],
};

const config = defineConfig({
	jsPlugins: [{ name: "better-tailwindcss", specifier: "eslint-plugin-better-tailwindcss" }],
	rules: {
		/**
		 * ================================================================================================================
		 * Correctness.
		 * ================================================================================================================
		 */

		"better-tailwindcss/no-unknown-classes": ["error", { ignore: ["lead", "not-prose", "not-richtext"] }],
		"better-tailwindcss/no-conflicting-classes": "error",
		"better-tailwindcss/no-restricted-classes": [
			"error",
			{
				restrict: [
					{
						pattern: "--palette-",
						message: "Use a semantic colour token instead of a palette value token.",
					},
				],
			},
		],

		/**
		 * ================================================================================================================
		 * Style.
		 * ================================================================================================================
		 */

		"better-tailwindcss/enforce-canonical-classes": "error",
		"better-tailwindcss/enforce-consistent-class-order": ["error", { order: "strict" }],
		"better-tailwindcss/enforce-consistent-important-position": "off",
		"better-tailwindcss/enforce-consistent-line-wrapping": "off",
		"better-tailwindcss/enforce-consistent-variable-syntax": "error",
		"better-tailwindcss/enforce-consistent-variant-order": "error",
		"better-tailwindcss/enforce-logical-properties": "error",
		"better-tailwindcss/enforce-shorthand-classes": "off",
		"better-tailwindcss/no-deprecated-classes": "error",
		"better-tailwindcss/no-duplicate-classes": "error",
		"better-tailwindcss/no-unnecessary-whitespace": "error",
	},
});

/**
 * The rules of this config, with their design system read from `entryPoint` instead of the shared `settings` - for
 * files styled by another stylesheet, e.g. the admin ui. Settings cannot be overridden per file, but rule options can.
 */
export function withEntryPoint(entryPoint: string): NonNullable<typeof config.rules> {
	return Object.fromEntries(
		Object.entries(config.rules).map(([name, value]) => {
			const [severity, options = {}] = Array.isArray(value) ? value : [value];

			return [name, severity === "off" ? value : [severity, { ...options, entryPoint }]];
		}),
	) as NonNullable<typeof config.rules>;
}

export default config;
