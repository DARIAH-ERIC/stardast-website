import type { APIContext } from "astro";

import { env } from "#/configs/env.config.ts";
import { type CmsConfig, config } from "#/src/cms/config.ts";
import { createCachedReader } from "#/src/lib/cms/astro.ts";
import type { Draft } from "#/src/lib/cms/drafts.ts";
import { type Reader, createReader } from "#/src/lib/cms/reader.ts";
import { createFilesystemStorage } from "#/src/lib/cms/storage/filesystem.ts";
import {
	type GitHubClient,
	type TokenProvider,
	createAppTokenProvider,
	createGitHubClient,
	createStaticTokenProvider,
} from "#/src/lib/cms/storage/github/client.ts";
import { type GitHubStorage, createGitHubStorage } from "#/src/lib/cms/storage/github/storage.ts";
import type { ContentStorage } from "#/src/lib/cms/storage/types.ts";

function createGitHubTokenProvider(): TokenProvider {
	const { CMS_GITHUB_APP_ID, CMS_GITHUB_APP_INSTALLATION_ID, CMS_GITHUB_APP_PRIVATE_KEY, CMS_GITHUB_TOKEN } = env;

	if (CMS_GITHUB_APP_ID != null && CMS_GITHUB_APP_INSTALLATION_ID != null && CMS_GITHUB_APP_PRIVATE_KEY != null) {
		return createAppTokenProvider({
			baseUrl: env.CMS_GITHUB_API_URL,
			appId: CMS_GITHUB_APP_ID,
			installationId: CMS_GITHUB_APP_INSTALLATION_ID,
			privateKey: CMS_GITHUB_APP_PRIVATE_KEY,
		});
	}

	if (CMS_GITHUB_TOKEN != null) {
		return createStaticTokenProvider(CMS_GITHUB_TOKEN);
	}

	throw new Error(
		"GitHub storage requires either CMS_GITHUB_APP_ID, CMS_GITHUB_APP_INSTALLATION_ID, and CMS_GITHUB_APP_PRIVATE_KEY, or CMS_GITHUB_TOKEN.",
	);
}

function createGitHubClientFromEnv(): GitHubClient {
	if (env.CMS_GITHUB_REPOSITORY == null) {
		throw new Error("GitHub storage requires CMS_GITHUB_REPOSITORY.");
	}

	return createGitHubClient({
		baseUrl: env.CMS_GITHUB_API_URL,
		repository: env.CMS_GITHUB_REPOSITORY,
		auth: createGitHubTokenProvider(),
		onRateLimitWarning(status) {
			// oxlint-disable-next-line no-console
			console.warn(
				`GitHub rate limit is running low: ${String(status.remaining)} of ${String(status.limit)} requests left until ${status.resetAt.toISOString()}.`,
			);
		},
	});
}

function getStorageMode(): "filesystem" | "github" {
	const mode = env.CMS_STORAGE ?? (import.meta.env.DEV ? "filesystem" : undefined);

	if (mode == null) {
		throw new Error(
			'CMS_STORAGE must be set for a production server: "github" for the content repository, or "filesystem" to deliberately use the content/ directory of the server\'s working tree, e.g. for tests.',
		);
	}

	return mode;
}

const storageMode = getStorageMode();

/** Authenticated as the server, with access to the content repository - only for `github` storage. */
export const githubClient: GitHubClient | undefined =
	storageMode === "github" ? createGitHubClientFromEnv() : undefined;

/** Set for `github` storage only, which can determine what changed between revisions, e.g. for the push webhook. */
export const githubStorage: GitHubStorage | undefined =
	githubClient != null ? createGitHubStorage({ client: githubClient }) : undefined;

/** Filesystem storage reads the `content/` directory of the checkout the server is started from. */
export const storage: ContentStorage = githubStorage ?? createFilesystemStorage({ root: process.cwd() });

/**
 * Called once per request by the middleware, which exposes the reader as `Astro.locals.content`: the reader pins the
 * content revision, and tags the response with everything it reads.
 */
export function createContentReader(context: Pick<APIContext, "cache">): Reader<CmsConfig> {
	return createCachedReader({ config, storage, context });
}

/** For the admin ui, whose responses are never cached. */
export function createUncachedContentReader(): Reader<CmsConfig> {
	return createReader({ config, storage });
}

/** Reads drafts instead of the published versions of their entries. Never cached. */
export function createPreviewContentReader(drafts: ReadonlyArray<Draft>): Reader<CmsConfig> {
	return createReader({
		config,
		storage,
		overlays: drafts.map((draft) => {
			return { path: draft.path, revision: draft.revision };
		}),
	});
}
