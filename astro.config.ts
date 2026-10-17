import node from "@astrojs/node";
import react from "@astrojs/react";
import optimizeLocales from "@react-aria/optimize-locales-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders, memoryCache, passthroughImageService } from "astro/config";
import * as v from "valibot";

import { loadEnvFiles } from "#/configs/env.files.ts";
import { client, maxUploadSizeLimit } from "#/configs/env.schema.ts";
import { cacheKeyQueryParams } from "#/src/config/cache.ts";

/**
 * The config file is evaluated before vite loads `.env` files into `import.meta.env`. Loading them into `process.env`
 * here also makes them available to server-only variables. Validating the client environment here also fails early on
 * missing values. Empty values are missing, as in `configs/env.config.ts` - e.g. a docker build argument whose github
 * variable is not set.
 */
loadEnvFiles();

const env = v.parse(client, Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== "")));

const site = new URL(env.PUBLIC_APP_BASE_URL);

export default defineConfig({
	/** Request bodies are at most an upload, see `/api/cms/media/uploads/` - the adapter's default would be 1gb. */
	adapter: node({ mode: "standalone", bodySizeLimit: maxUploadSizeLimit * 1024 * 1024 }),
	cache: {
		provider: memoryCache({ query: { include: [...cacheKeyQueryParams] } }),
	},
	integrations: [react()],
	image: {
		/**
		 * Media are resized by imgproxy or the `/media/` route, see `src/cms/media.ts`, not by astro's `/_image` endpoint,
		 * which is not used.
		 */
		service: passthroughImageService(),
	},
	fonts: [
		{
			name: "Roboto",
			cssVariable: "--font-roboto",
			provider: fontProviders.fontsource(),
			weights: ["100 900"],
			styles: ["normal", "italic"],
			subsets: ["latin", "latin-ext"],
			fallbacks: ["system-ui", "sans-serif"],
		},
		{
			name: "Roboto Mono",
			cssVariable: "--font-roboto-mono",
			provider: fontProviders.fontsource(),
			weights: ["400 500"],
			styles: ["normal"],
			subsets: ["latin", "latin-ext"],
			fallbacks: ["ui-monospace", "monospace"],
		},
	],
	output: "server",
	server: {
		port: 3000,
	},
	/**
	 * Behind a proxy which terminates tls, requests arrive over http, and astro trusts `x-forwarded-*` and `host` headers
	 * only for allowed domains - otherwise request urls are `http://localhost`, which e.g. fails astro's origin check for
	 * form posts.
	 */
	security: {
		allowedDomains: [{ protocol: site.protocol.slice(0, -1), hostname: site.hostname, port: site.port || undefined }],
	},
	site: env.PUBLIC_APP_BASE_URL,
	vite: {
		plugins: [
			tailwindcss(),
			/**
			 * The admin ui is english-only, see the `I18nProvider` in `entry-editor.tsx`. React aria's english strings are
			 * `en-US`, which a region-less locale matches.
			 */
			optimizeLocales.vite({ locales: ["en"] }),
			/**
			 * Bundles all dependencies into the server build, so that the container image needs no `node_modules` - which
			 * would otherwise include astro's build tooling. Only for builds: the dev server fails to evaluate some bundled
			 * commonjs dependencies. `sharp` has native binaries, which cannot be bundled, and is installed separately, see
			 * the `Dockerfile`.
			 */
			{
				name: "bundle-server-dependencies",
				apply: "build",
				config() {
					return { ssr: { noExternal: true, external: ["sharp"] } };
				},
			},
		],
		server: {
			watch: {
				/**
				 * Content is read from disk on every request, not imported, so changes need no reload - and saving in the admin
				 * ui would otherwise reload the editor with every save.
				 */
				ignored: ["**/content/**", "**/.cms/**"],
			},
		},
	},
});
