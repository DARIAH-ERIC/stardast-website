import { defineConfig } from "oxfmt";

import base from "#/configs/oxfmt/base.ts";

const config = defineConfig({
	...base,
	ignorePatterns: ["content/", "e2e/snapshots/", "public/"],
});

export default config;
