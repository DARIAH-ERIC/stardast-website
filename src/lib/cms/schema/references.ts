import type {
	ArrayField,
	BlocksField,
	Field,
	Fields,
	ImageField,
	ObjectField,
	ReferenceField,
} from "#/src/lib/cms/schema/fields.ts";
import { type RichTextField, type RichTextNode, isTextNode } from "#/src/lib/cms/schema/rich-text.ts";

export interface EntryReference {
	collection: string;
	id: string;
	/** Where in the entry the reference is, e.g. `authors[0]`, or `content<callout>[3].person`. */
	path: string;
}

/**
 * Finds all references in an entry's (validated) data, including references nested in objects, arrays, blocks, and rich
 * text blocks - e.g. to resolve them, to check for dangling references, or to rewrite them when an entry is renamed.
 */
export function collectReferences(fields: Fields, data: unknown): Array<EntryReference> {
	const references: Array<EntryReference> = [];

	visitFields(fields, data, "", references);

	return references;
}

function visitFields(fields: Fields, data: unknown, prefix: string, references: Array<EntryReference>): void {
	if (data == null || typeof data !== "object") {
		return;
	}

	for (const [name, field] of Object.entries(fields)) {
		visitValue(field, (data as Record<string, unknown>)[name], prefix ? `${prefix}.${name}` : name, references);
	}
}

function visitValue(field: Field, value: unknown, path: string, references: Array<EntryReference>): void {
	if (value == null) {
		return;
	}

	switch (field.kind) {
		case "image":
		case "reference": {
			if (typeof value === "string" && value !== "") {
				references.push({ collection: (field as ImageField | ReferenceField).collection, id: value, path });
			}
			break;
		}

		case "object": {
			visitFields((field as ObjectField).fields, value, path, references);
			break;
		}

		case "array": {
			if (Array.isArray(value)) {
				value.forEach((item, index) => {
					visitValue((field as ArrayField).item, item, `${path}[${String(index)}]`, references);
				});
			}
			break;
		}

		case "blocks": {
			if (Array.isArray(value)) {
				const { blocks } = field as BlocksField;

				value.forEach((item: { type: string; data: unknown }, index) => {
					const block = blocks[item.type];

					if (block != null) {
						visitFields(block.fields, item.data, `${path}<${item.type}>[${String(index)}]`, references);
					}
				});
			}
			break;
		}

		case "richText": {
			const { blocks } = field as RichTextField;
			let index = 0;

			/** Indices count block nodes in document order, which is stable enough to point an editor at a problem. */
			function visitNode(node: RichTextNode): void {
				if (isTextNode(node)) {
					return;
				}

				const block = blocks[node.type];

				if (block != null) {
					visitFields(block.fields, node.attrs, `${path}<${node.type}>[${String(index)}]`, references);
					index++;
				}

				node.content?.forEach(visitNode);
			}

			visitNode(value as RichTextNode);
			break;
		}
	}
}
