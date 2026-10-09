/**
 * Only local paths - e.g. admin pages, or previews - so that the sign-in flow cannot be used as an open redirect: `//`
 * and `/\` start protocol-relative urls to other hosts, and browsers strip tabs and newlines from urls, so e.g.
 * `/\t/example.org` would be one too.
 */
export function getSafeReturnTo(value: string | null | undefined, fallback = "/admin"): string {
	// oxlint-disable-next-line no-control-regex
	if (value != null && /^\/(?!\/)/.test(value) && !/[\s\\\u0000-\u001F\u007F]/.test(value)) {
		return value;
	}

	return fallback;
}
