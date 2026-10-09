declare namespace App {
	interface Locals {
		/** Reads content for the current request, pinned to one revision, and tags the response with what it reads. */
		content: import("#/src/lib/cms/reader.ts").Reader<import("#/src/cms/config.ts").CmsConfig>;
		/** Only read for admin and cms api routes, so that public pages never depend on it. */
		session?: import("#/src/cms/auth.ts").Session;
		/** Set when rendering a public page with drafts, see `?preview`. */
		preview?: { drafts: number; exitUrl: string };
	}
}
