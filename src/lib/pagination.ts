export interface Page<T> {
	items: Array<T>;
	/** 1-based. */
	page: number;
	pageCount: number;
}

/**
 * Parses the `page` query parameter: missing means the first page, anything but a positive integer without leading
 * zeros is invalid - so that each page has exactly one url.
 */
export function parsePageParam(value: string | null): number | undefined {
	if (value == null) {
		return 1;
	}

	return /^[1-9]\d{0,5}$/.test(value) ? Number(value) : undefined;
}

/** Returns `undefined` for pages past the last one. An empty list still has one, empty, page. */
export function paginate<T>(items: ReadonlyArray<T>, page: number, pageSize: number): Page<T> | undefined {
	const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

	if (page < 1 || page > pageCount) {
		return undefined;
	}

	return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageCount };
}
