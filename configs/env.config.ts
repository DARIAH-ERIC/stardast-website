import { client, serverBuild, serverRuntime } from "#/configs/env.schema.ts";
import { define } from "#/src/lib/env/index.ts";

const validate = define({ clientPrefix: "PUBLIC_", client, serverBuild, serverRuntime });

/** `process` does not exist in the client bundle, where server-only values are not validated anyway. */
const serverEnvironment: Record<string, string | undefined> = import.meta.env.SSR ? process.env : {};

export const env = validate({
	environment: {
		PUBLIC_APP_BASE_URL: import.meta.env.PUBLIC_APP_BASE_URL,
		PUBLIC_APP_BOTS: import.meta.env.PUBLIC_APP_BOTS,
		PUBLIC_APP_GOOGLE_SITE_VERIFICATION: import.meta.env.PUBLIC_APP_GOOGLE_SITE_VERIFICATION,
		PUBLIC_APP_MATOMO_BASE_URL: import.meta.env.PUBLIC_APP_MATOMO_BASE_URL,
		PUBLIC_APP_MATOMO_ID: import.meta.env.PUBLIC_APP_MATOMO_ID,
		CMS_STORAGE: serverEnvironment.CMS_STORAGE,
		CMS_GITHUB_API_URL: serverEnvironment.CMS_GITHUB_API_URL,
		CMS_GITHUB_REPOSITORY: serverEnvironment.CMS_GITHUB_REPOSITORY,
		CMS_GITHUB_TOKEN: serverEnvironment.CMS_GITHUB_TOKEN,
		CMS_GITHUB_APP_ID: serverEnvironment.CMS_GITHUB_APP_ID,
		CMS_GITHUB_APP_INSTALLATION_ID: serverEnvironment.CMS_GITHUB_APP_INSTALLATION_ID,
		CMS_GITHUB_APP_PRIVATE_KEY: serverEnvironment.CMS_GITHUB_APP_PRIVATE_KEY,
		REVALIDATION_WEBHOOK_SECRET: serverEnvironment.REVALIDATION_WEBHOOK_SECRET,
		BASEROW_API_BASE_URL: serverEnvironment.BASEROW_API_BASE_URL,
		BASEROW_TOKEN: serverEnvironment.BASEROW_TOKEN,
		TYPESENSE_URL: serverEnvironment.TYPESENSE_URL,
		TYPESENSE_API_KEY: serverEnvironment.TYPESENSE_API_KEY,
		TYPESENSE_COLLECTION: serverEnvironment.TYPESENSE_COLLECTION,
		CMS_AUTH: serverEnvironment.CMS_AUTH,
		CMS_GITHUB_OAUTH_CLIENT_ID: serverEnvironment.CMS_GITHUB_OAUTH_CLIENT_ID,
		CMS_GITHUB_OAUTH_CLIENT_SECRET: serverEnvironment.CMS_GITHUB_OAUTH_CLIENT_SECRET,
		CMS_SESSION_SECRET: serverEnvironment.CMS_SESSION_SECRET,
		CMS_ADMIN_USERS: serverEnvironment.CMS_ADMIN_USERS,
		CMS_ASSETS: serverEnvironment.CMS_ASSETS,
		CMS_MAX_UPLOAD_SIZE: serverEnvironment.CMS_MAX_UPLOAD_SIZE,
		CMS_S3_ENDPOINT: serverEnvironment.CMS_S3_ENDPOINT,
		CMS_S3_REGION: serverEnvironment.CMS_S3_REGION,
		CMS_S3_BUCKET: serverEnvironment.CMS_S3_BUCKET,
		CMS_S3_ACCESS_KEY_ID: serverEnvironment.CMS_S3_ACCESS_KEY_ID,
		CMS_S3_SECRET_ACCESS_KEY: serverEnvironment.CMS_S3_SECRET_ACCESS_KEY,
		CMS_S3_PREFIX: serverEnvironment.CMS_S3_PREFIX,
		IMGPROXY_BASE_URL: serverEnvironment.IMGPROXY_BASE_URL,
		IMGPROXY_KEY: serverEnvironment.IMGPROXY_KEY,
		IMGPROXY_SALT: serverEnvironment.IMGPROXY_SALT,
		MATOMO_API_TOKEN: serverEnvironment.MATOMO_API_TOKEN,
		ZENODO_TOKEN: serverEnvironment.ZENODO_TOKEN,
	},
	mode: serverEnvironment.ENV_VALIDATION,
}).unwrap();
