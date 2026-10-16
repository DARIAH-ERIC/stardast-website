import * as v from "valibot";

/**
 * Inlined into the client and server bundles at build time, so these must be correct when `astro build` runs. Read via
 * `import.meta.env`, so that client and server always see the same value.
 */
export const client = v.object({
	PUBLIC_APP_BASE_URL: v.pipe(v.string(), v.url()),
	/**
	 * Whether search engines may index the site. Until then, `robots.txt` disallows everything, and every response is
	 * marked `noindex` - since `robots.txt` alone does not remove pages which are already indexed.
	 */
	PUBLIC_APP_BOTS: v.optional(v.picklist(["disabled", "enabled"]), "disabled"),
	/** The google search console's html tag verification - its `content`, not the whole tag. */
	PUBLIC_APP_GOOGLE_SITE_VERIFICATION: v.optional(v.string()),
	/** Defaults to the acdh instance. */
	PUBLIC_APP_MATOMO_BASE_URL: v.optional(v.pipe(v.string(), v.url()), "https://matomo.acdh.oeaw.ac.at"),
	/** Pages are only tracked when this is set. */
	PUBLIC_APP_MATOMO_ID: v.optional(v.pipe(v.string(), v.regex(/^\d+$/))),
});

/**
 * Not exposed to the client, but required while building the app, so these must stay available in the `build`
 * validation mode. Currently only build tooling configuration. A secret belongs here only if a prerendered route
 * genuinely needs it at build time - which makes every build, including the container image build, require that secret.
 * Make that choice deliberately; do not move an item here to silence a throw from the `build` mode.
 */
export const serverBuild = v.object({});

/**
 * Not exposed to the client, and only required once a server is running. Read via `process.env`, never via
 * `import.meta.env`, which would inline the value into the server bundle at build time.
 */
export const serverRuntime = v.object({
	/**
	 * `filesystem` reads and writes the `content/` directory of the working tree, `github` reads and commits via the
	 * github api. Defaults to `filesystem` in `astro dev` only - a production server must set it explicitly, since it
	 * would otherwise silently write to its own, ephemeral, filesystem.
	 */
	CMS_STORAGE: v.optional(v.picklist(["filesystem", "github"])),
	/** Only needed for github enterprise server, e.g. `https://github.example.org/api/v3/`. */
	CMS_GITHUB_API_URL: v.optional(v.pipe(v.string(), v.url())),
	/** In `owner/repo` format. Required for `github` storage. */
	CMS_GITHUB_REPOSITORY: v.optional(v.pipe(v.string(), v.regex(/^[\w.-]+\/[\w.-]+$/))),
	/** A fine-grained personal access token with contents read and write access, e.g. for development. */
	CMS_GITHUB_TOKEN: v.optional(v.string()),
	/** A github app installation, used instead of `CMS_GITHUB_TOKEN` when configured. */
	CMS_GITHUB_APP_ID: v.optional(v.string()),
	CMS_GITHUB_APP_INSTALLATION_ID: v.optional(v.string()),
	/** Pem-encoded. Newlines may be escaped as `\n`, for environments which do not support multi-line values. */
	CMS_GITHUB_APP_PRIVATE_KEY: v.optional(
		v.pipe(
			v.string(),
			v.transform((value) => value.replaceAll("\\n", "\n")),
		),
	),
	/** `github` signs in with github, `development` as a local user without any setup - only in `astro dev`. */
	CMS_AUTH: v.optional(v.picklist(["development", "github"])),
	/** A github oauth app, or a github app's client id and secret. */
	CMS_GITHUB_OAUTH_CLIENT_ID: v.optional(v.string()),
	CMS_GITHUB_OAUTH_CLIENT_SECRET: v.optional(v.string()),
	/** Encrypts the session cookie. Changing it signs everyone out. */
	CMS_SESSION_SECRET: v.optional(v.pipe(v.string(), v.minLength(32))),
	/**
	 * Comma-separated github logins which may edit content. When not set, everyone with write access to
	 * `CMS_GITHUB_REPOSITORY` may.
	 */
	CMS_ADMIN_USERS: v.optional(
		v.pipe(
			v.string(),
			v.transform((value) =>
				value
					.split(",")
					.map((login) => login.trim())
					.filter((login) => login !== ""),
			),
		),
	),
	/** Where uploads go: `repo` commits them to the content repository, `s3` stores them in an object storage. */
	CMS_ASSETS: v.optional(v.picklist(["repo", "s3"]), "repo"),
	/** Maximum upload size, in megabytes. */
	CMS_MAX_UPLOAD_SIZE: v.optional(
		v.pipe(v.string(), v.transform(Number), v.number(), v.integer(), v.minValue(1)),
		"20",
	),
	/** An s3-compatible object storage, e.g. ceph's rados gateway, addressed path-style. */
	CMS_S3_ENDPOINT: v.optional(v.pipe(v.string(), v.url())),
	CMS_S3_REGION: v.optional(v.string()),
	CMS_S3_BUCKET: v.optional(v.string()),
	CMS_S3_ACCESS_KEY_ID: v.optional(v.string()),
	CMS_S3_SECRET_ACCESS_KEY: v.optional(v.string()),
	/** Prepended to all object keys, e.g. `stardast/`, to share a bucket. */
	CMS_S3_PREFIX: v.optional(v.string()),
	/** Resizes and converts images. Without it, the site does so itself, see `createTransformLoader()`. */
	IMGPROXY_BASE_URL: v.optional(v.pipe(v.string(), v.url())),
	/** Hex-encoded. Required in production - unsigned imgproxy urls are only allowed in `astro dev`. */
	IMGPROXY_KEY: v.optional(v.pipe(v.string(), v.hexadecimal())),
	IMGPROXY_SALT: v.optional(v.pipe(v.string(), v.hexadecimal())),
	/** Baserow, which stores mailing list signups. Defaults to the acdh instance. */
	BASEROW_API_BASE_URL: v.optional(v.pipe(v.string(), v.url()), "https://baserow.acdh-dev.oeaw.ac.at"),
	/** A database token, which can create rows in the subscribers table. Without it, the signup form shows an error. */
	BASEROW_TOKEN: v.optional(v.string()),
	/**
	 * Site search uses typesense when this is set - all three are required then - and an in-memory index otherwise. The
	 * api key needs to manage collections and aliases, and is only used on the server.
	 */
	TYPESENSE_URL: v.optional(v.pipe(v.string(), v.url())),
	TYPESENSE_API_KEY: v.optional(v.string()),
	/** The alias searches go to. Each rebuild of the index creates a new collection, named after it. */
	TYPESENSE_COLLECTION: v.optional(v.pipe(v.string(), v.regex(/^[\w-]+$/))),
	/** Shared with the github webhook, which announces pushes so that changed pages can be invalidated. */
	REVALIDATION_WEBHOOK_SECRET: v.optional(v.pipe(v.string(), v.minLength(32))),
	/**
	 * Reads the visitor numbers and search terms shown in the cms, at `/admin/analytics`, for `PUBLIC_APP_MATOMO_ID`.
	 * Should belong to a matomo user with view access only, since a token grants everything its user may do.
	 */
	MATOMO_API_TOKEN: v.optional(v.string()),
});

/**
 * Only needed by the scripts in `#/scripts/`, never by the app itself, so these are not part of the validated
 * environment in `./env.config.ts` - a deployed server must not need, nor have, e.g. admin access to the search index.
 */
export const scripts = v.object({});
