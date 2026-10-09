import type { APIRoute } from "astro";

import { clearSession } from "#/src/cms/auth.ts";

/** A `POST`, so that a link or an image elsewhere cannot sign users out. */
export const POST: APIRoute = (context) => {
	clearSession(context);

	return context.redirect("/admin/login");
};
