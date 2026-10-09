import type { SnippetSegment } from "#/src/lib/cms/search/types.ts";

/** Ignores case and diacritics, e.g. so that "koc" matches "Koç". */
export function normalizeTerm(term: string): string {
	return term.normalize("NFKD").replaceAll(/\p{M}/gu, "").toLowerCase();
}

const wordPattern = /[\p{L}\p{N}]+/gu;

/**
 * Excerpts `text` around the first word which matches one of `terms` - words as normalized by `normalizeTerm()` - and
 * highlights all matching words in the excerpt. Starts at the beginning of the text when nothing matches, e.g. when
 * only the title did.
 */
export function createSnippet(text: string, terms: ReadonlyArray<string>, maxLength = 200): Array<SnippetSegment> {
	const matches = new Set(terms.map((term) => normalizeTerm(term)));
	const words = [...text.matchAll(wordPattern)].map((match) => {
		return { start: match.index, end: match.index + match[0].length, isMatch: matches.has(normalizeTerm(match[0])) };
	});

	const first = words.find((word) => word.isMatch);

	/** Some context before the first match, starting at a word. */
	let start = 0;

	if (first != null && first.end > maxLength) {
		const contextStart = Math.max(0, first.start - Math.floor(maxLength / 4));
		start = words.find((word) => word.start >= contextStart)?.start ?? first.start;
	}

	/** Ends after a whole word. */
	let end = Math.min(text.length, start + maxLength);

	if (end < text.length) {
		end = words.findLast((word) => word.end <= end && word.start >= start)?.end ?? end;
	}

	const segments: Array<SnippetSegment> = [];

	function push(value: string, highlight: boolean): void {
		const last = segments.at(-1);

		if (last?.highlight === highlight) {
			last.text += value;
		} else if (value !== "") {
			segments.push({ text: value, highlight });
		}
	}

	if (start > 0) {
		push("… ", false);
	}

	let position = start;

	for (const word of words) {
		if (!word.isMatch || word.start < start || word.end > end) {
			continue;
		}

		push(text.slice(position, word.start), false);
		push(text.slice(word.start, word.end), true);
		position = word.end;
	}

	push(text.slice(position, end), false);

	if (end < text.length) {
		push(" …", false);
	}

	return segments;
}
