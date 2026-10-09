import type { ArrayField, Blocks, BlocksField, Field, Fields, ObjectField } from "#/src/lib/cms/schema/fields.ts";
import type { RichTextField, RichTextNode } from "#/src/lib/cms/schema/rich-text.ts";

/**
 * Collects the human-readable text of an entry, guided by its fields: text, textarea, and rich text - including the
 * text fields of rich text blocks - in objects, arrays, and blocks. Skips everything else, e.g. urls, dates, or the ids
 * of referenced entries, which would only add noise to a search index.
 */
export function extractText(
	fields: Fields,
	data: unknown,
	options: {
		/** Names of text fields which hold no prose, e.g. urls or anchors - skipped at any depth. */
		skip?: ReadonlyArray<string>;
	} = {},
): string {
	const parts: Array<string> = [];

	collectFields(fields, data, { parts, skip: new Set(options.skip) });

	return parts.join("\n");
}

interface Context {
	parts: Array<string>;
	skip: ReadonlySet<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value != null && !Array.isArray(value);
}

function collectFields(fields: Fields, data: unknown, context: Context): void {
	if (!isRecord(data)) {
		return;
	}

	for (const [name, field] of Object.entries(fields)) {
		if (!context.skip.has(name)) {
			collectField(field, data[name], context);
		}
	}
}

function collectField(field: Field, value: unknown, context: Context): void {
	switch (field.kind) {
		case "text":
		case "textarea": {
			if (typeof value === "string" && value.trim() !== "") {
				context.parts.push(value.trim());
			}
			break;
		}

		case "richText": {
			if (isRecord(value) && Array.isArray(value.content)) {
				collectNodes(value.content as Array<RichTextNode>, (field as RichTextField).blocks, context);
			}
			break;
		}

		case "object": {
			collectFields((field as ObjectField).fields, value, context);
			break;
		}

		case "array": {
			if (Array.isArray(value)) {
				for (const item of value) {
					collectField((field as ArrayField).item, item, context);
				}
			}
			break;
		}

		case "blocks": {
			if (Array.isArray(value)) {
				const { blocks } = field as BlocksField;

				for (const item of value) {
					if (isRecord(item) && typeof item.type === "string" && Object.hasOwn(blocks, item.type)) {
						collectFields(blocks[item.type]!.fields, item.data, context);
					}
				}
			}
			break;
		}
	}
}

/** Text nodes of one block-level node are joined, so that e.g. a bold word stays part of its sentence. */
function collectNodes(nodes: ReadonlyArray<RichTextNode>, blocks: Blocks, context: Context): void {
	for (const node of nodes) {
		if (Object.hasOwn(blocks, node.type) && "attrs" in node) {
			collectFields(blocks[node.type]!.fields, node.attrs, context);
			continue;
		}

		if (!("content" in node) || node.content == null) {
			continue;
		}

		if (node.content.every((child) => child.type === "text" || !("content" in child))) {
			const text = node.content.map((child) => ("text" in child ? child.text : "")).join("");

			if (text.trim() !== "") {
				context.parts.push(text.trim());
			}
		} else {
			collectNodes(node.content, blocks, context);
		}
	}
}
