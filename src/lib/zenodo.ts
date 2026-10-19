import { Result, TaggedError } from "better-result";
import * as v from "valibot";

/** Narrower than `typeof fetch`, so that tests can pass a plain function. */
export type Fetch = (input: URL, init?: RequestInit) => Promise<Response>;

export class ZenodoError extends TaggedError("ZenodoError")<{ readonly message: string }> {}

export interface ZenodoRecord {
	id: string;
	title: string;
	/** A year, month or day, e.g. `2026`, `2026-10` or `2026-10-01` - zenodo allows partial dates. */
	publicationDate: string;
	/** Html, as entered on zenodo. */
	description?: string;
	keywords: Array<string>;
	/** The record's page on zenodo. */
	url: string;
}

/** Zenodo's search responses, without what the site does not use - see https://developers.zenodo.org. */
const RecordSchema = v.object({
	id: v.union([v.string(), v.number()]),
	links: v.object({ self_html: v.pipe(v.string(), v.url()) }),
	metadata: v.object({
		title: v.string(),
		/** Edtf, e.g. `2026`, `2026-10-01`, or a range, `2025/2026` - of which only the start is kept. */
		publication_date: v.pipe(
			v.string(),
			v.regex(/^\d{4}(?:-\d{2}(?:-\d{2})?)?(?:\/|$)/),
			v.transform((value) => value.split("/")[0]!),
		),
		description: v.optional(v.string()),
		keywords: v.optional(v.array(v.string()), []),
	}),
});

const PageSchema = v.object({
	/** Parsed one by one, so that a record zenodo describes unexpectedly is skipped, rather than failing the page. */
	hits: v.object({ hits: v.array(v.unknown()) }),
	links: v.object({ next: v.optional(v.pipe(v.string(), v.url())) }),
});

/** Zenodo rejects node's default `User-Agent: node` with a 403, so requests always identify the site. */
const userAgent = "stardast-website (https://github.com/DARIAH-ERIC/stardast-website)";

/** The largest pages zenodo serves, without and with an access token. */
const pageSize = { guest: 25, authenticated: 100 };

export interface ZenodoClient {
	/** All records in a community, newest first. */
	listCommunityRecords: (community: string) => Promise<Result<Array<ZenodoRecord>, ZenodoError>>;
}

export function createZenodoClient(params?: {
	/** E.g. `https://sandbox.zenodo.org`, for testing. */
	baseUrl?: string;
	/**
	 * Zenodo allows 30 search requests a minute without an access token - so records are fetched in pages of 25, or of
	 * 100 with a token, up to this many.
	 */
	maxPages?: number;
	/** A personal access token, without any scopes - only for higher rate limits and larger pages. */
	token?: string;
	fetch?: Fetch;
}): ZenodoClient {
	const { baseUrl = "https://zenodo.org", maxPages = 10, token, fetch = globalThis.fetch } = params ?? {};

	const headers: Record<string, string> = { accept: "application/json", "user-agent": userAgent };

	if (token != null && token !== "") {
		headers.authorization = `Bearer ${token}`;
	}

	return {
		async listCommunityRecords(community) {
			const records: Array<ZenodoRecord> = [];

			let url: URL | undefined = new URL(
				`api/communities/${encodeURIComponent(community)}/records`,
				`${baseUrl.replace(/\/$/, "")}/`,
			);
			url.searchParams.set("size", String(headers.authorization != null ? pageSize.authenticated : pageSize.guest));
			url.searchParams.set("sort", "newest");

			/** One page after the other, since each links to the next. */
			for (let page = 1; url != null && page <= maxPages; page++) {
				const request: URL = url;

				// oxlint-disable-next-line no-await-in-loop
				const response = await Result.tryPromise({
					try: () => fetch(request, { headers, signal: AbortSignal.timeout(10_000) }),
					catch: (error) => new ZenodoError({ message: `Request to zenodo failed: ${String(error)}` }),
				});

				if (response.isErr()) {
					return Result.err(response.error);
				}

				if (!response.value.ok) {
					return Result.err(
						new ZenodoError({ message: `Zenodo responded with ${String(response.value.status)} for ${request.href}.` }),
					);
				}

				// oxlint-disable-next-line no-await-in-loop
				const body = v.safeParse(PageSchema, await response.value.json().catch(() => undefined));

				if (!body.success) {
					return Result.err(
						new ZenodoError({ message: `Zenodo responded with an unexpected page of records for ${request.href}.` }),
					);
				}

				for (const hit of body.output.hits.hits) {
					const parsed = v.safeParse(RecordSchema, hit);

					if (!parsed.success) {
						continue;
					}

					const record = parsed.output;

					records.push({
						id: String(record.id),
						title: record.metadata.title,
						publicationDate: record.metadata.publication_date,
						description: record.metadata.description,
						keywords: record.metadata.keywords,
						url: record.links.self_html,
					});
				}

				url = body.output.links.next != null ? new URL(body.output.links.next) : undefined;
			}

			return Result.ok(records);
		},
	};
}

const entities: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * Plain text from a description's html, shortened at a word boundary - for a card, rather than the full description.
 * Rendered as text, so that the html entered on zenodo is never rendered as html.
 */
export function summarize(html: string, maxLength = 300): string {
	const text = html
		.replaceAll(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?>/gi, " ")
		.replaceAll(/<[^>]*>/g, "")
		.replaceAll(/&(?:#(?<decimal>\d+)|#x(?<hex>[\da-f]+)|(?<name>[a-z]+));/gi, (match, ...args: Array<unknown>) => {
			const { decimal, hex, name } = args.at(-1) as { decimal?: string; hex?: string; name?: string };

			if (decimal != null) {
				return String.fromCodePoint(Number(decimal));
			}

			if (hex != null) {
				return String.fromCodePoint(Number(`0x${hex}`));
			}

			return entities[name!.toLowerCase()] ?? match;
		})
		.replaceAll(/\s+/g, " ")
		.trim();

	if (text.length <= maxLength) {
		return text;
	}

	const cut = text.slice(0, maxLength - 1);
	const boundary = cut.lastIndexOf(" ");

	return `${(boundary > maxLength / 2 ? cut.slice(0, boundary) : cut).replace(/[\s.,;:]+$/, "")}…`;
}
