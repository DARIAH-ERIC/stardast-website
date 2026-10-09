import * as v from "valibot";

import type { Block, Blocks, Field } from "#/src/lib/cms/schema/fields.ts";

/**
 * Rich text is stored as prosemirror json. Node and mark names follow tiptap's extensions, which the admin editor is
 * built with, so the stored json can be loaded into the editor as is.
 */
export const richTextMarks = [
	"bold",
	"italic",
	"underline",
	"strike",
	"code",
	"subscript",
	"superscript",
	"link",
] as const;

export type RichTextMarkType = (typeof richTextMarks)[number];

/** `doc`, `paragraph`, `text`, and `hardBreak` are always allowed. `listItem` is allowed with either list type. */
export const richTextNodes = [
	"heading",
	"bulletList",
	"orderedList",
	"blockquote",
	"codeBlock",
	"horizontalRule",
] as const;

export type RichTextNodeType = (typeof richTextNodes)[number];

const builtInNodeTypes = new Set<string>(["doc", "paragraph", "text", "hardBreak", "listItem", ...richTextNodes]);

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface RichTextMark {
	type: string;
	attrs?: Record<string, unknown>;
}

export interface RichTextTextNode {
	type: "text";
	text: string;
	marks?: Array<RichTextMark>;
}

export interface RichTextElementNode {
	type: string;
	attrs?: Record<string, unknown>;
	content?: Array<RichTextNode>;
}

export type RichTextNode = RichTextElementNode | RichTextTextNode;

export interface RichTextDocument {
	type: "doc";
	content: Array<RichTextElementNode>;
}

export function isTextNode(node: RichTextNode): node is RichTextTextNode {
	return node.type === "text";
}

const safeHrefPattern = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

/** Relative urls, fragments, and the `http(s)`, `mailto`, and `tel` schemes - notably not `javascript:`. */
export function isSafeHref(href: string): boolean {
	return safeHrefPattern.test(href.trim());
}

const SafeHrefSchema = v.pipe(
	v.string(),
	v.trim(),
	v.regex(safeHrefPattern, "Must be an http(s), mailto, tel, or relative url."),
);

export interface RichTextField<TBlocks extends Blocks = Blocks> extends Field<
	"richText",
	v.GenericSchema<RichTextDocument>
> {
	readonly marks: ReadonlyArray<RichTextMarkType>;
	readonly nodes: ReadonlyArray<RichTextNodeType>;
	readonly headingLevels: ReadonlyArray<HeadingLevel>;
	readonly blocks: TBlocks;
}

/** Defaults to no blocks, rather than any block - so that the renderer's block components can be checked. */
// oxlint-disable-next-line typescript/no-generated-empty-object-type
export function richText<const TBlocks extends Blocks = Record<never, Block>>(params: {
	label: string;
	description?: string;
	marks?: ReadonlyArray<RichTextMarkType>;
	nodes?: ReadonlyArray<RichTextNodeType>;
	/** Defaults to levels 2 to 4, because the page title is the only level 1 heading. */
	headingLevels?: ReadonlyArray<HeadingLevel>;
	/** Custom block nodes, stored with their field values as the node's `attrs`. */
	blocks?: TBlocks;
}): RichTextField<TBlocks> {
	const { label, description, marks = [], nodes = [], headingLevels = [2, 3, 4], blocks = {} as TBlocks } = params;

	for (const type of Object.keys(blocks)) {
		if (builtInNodeTypes.has(type)) {
			throw new Error(`Rich text block "${type}" must not use the name of a built-in node.`);
		}
	}

	return {
		kind: "richText",
		label,
		description,
		marks,
		nodes,
		headingLevels,
		blocks,
		schema: createRichTextSchema({ marks, nodes, headingLevels, blocks }),
		defaultValue: () => {
			return { type: "doc", content: [{ type: "paragraph" }] };
		},
	};
}

/**
 * Validates the document structure - which nodes may contain which - as well as node and mark attributes. Unknown
 * attributes, e.g. ones the editor adds for its own use, are stripped.
 */
function createRichTextSchema(params: {
	marks: ReadonlyArray<RichTextMarkType>;
	nodes: ReadonlyArray<RichTextNodeType>;
	headingLevels: ReadonlyArray<HeadingLevel>;
	blocks: Blocks;
}): v.GenericSchema<RichTextDocument> {
	const { marks, nodes, headingLevels, blocks } = params;

	const allowedNodes = new Set(nodes);

	// oxlint-disable-next-line typescript/no-explicit-any
	type AnyVariantOption = any;

	const markOptions: Array<AnyVariantOption> = marks.map((type) => {
		if (type === "link") {
			return v.object({ type: v.literal("link"), attrs: v.object({ href: SafeHrefSchema }) });
		}

		return v.object({ type: v.literal(type) });
	});

	const NonEmptyTextSchema = v.pipe(v.string(), v.nonEmpty());

	const TextSchema = v.object({
		type: v.literal("text"),
		text: NonEmptyTextSchema,
		marks: markOptions.length > 0 ? v.optional(v.array(v.variant("type", markOptions))) : v.optional(v.tuple([])),
	});

	const InlineSchema = v.variant("type", [TextSchema, v.object({ type: v.literal("hardBreak") })]);

	const blockOptions: Array<AnyVariantOption> = [
		v.object({ type: v.literal("paragraph"), content: v.optional(v.array(InlineSchema)) }),
	];

	// oxlint-disable-next-line prefer-const
	let BlockVariantSchema: v.GenericSchema<RichTextElementNode>;
	const BlockSchema = v.lazy(() => BlockVariantSchema);
	const BlockContentSchema = v.pipe(v.array(BlockSchema), v.minLength(1));

	const ListItemsSchema = v.pipe(
		v.array(v.object({ type: v.literal("listItem"), content: BlockContentSchema })),
		v.minLength(1),
	);

	if (allowedNodes.has("heading")) {
		blockOptions.push(
			v.object({
				type: v.literal("heading"),
				attrs: v.object({ level: v.picklist(headingLevels) }),
				content: v.optional(v.array(InlineSchema)),
			}),
		);
	}

	if (allowedNodes.has("bulletList")) {
		blockOptions.push(v.object({ type: v.literal("bulletList"), content: ListItemsSchema }));
	}

	if (allowedNodes.has("orderedList")) {
		blockOptions.push(
			v.object({
				type: v.literal("orderedList"),
				attrs: v.optional(v.object({ start: v.optional(v.pipe(v.number(), v.integer())) })),
				content: ListItemsSchema,
			}),
		);
	}

	if (allowedNodes.has("blockquote")) {
		blockOptions.push(v.object({ type: v.literal("blockquote"), content: BlockContentSchema }));
	}

	if (allowedNodes.has("codeBlock")) {
		blockOptions.push(
			v.object({
				type: v.literal("codeBlock"),
				attrs: v.optional(v.object({ language: v.nullish(v.string()) })),
				content: v.optional(v.array(v.object({ type: v.literal("text"), text: NonEmptyTextSchema }))),
			}),
		);
	}

	if (allowedNodes.has("horizontalRule")) {
		blockOptions.push(v.object({ type: v.literal("horizontalRule") }));
	}

	for (const [type, block] of Object.entries(blocks)) {
		blockOptions.push(v.object({ type: v.literal(type), attrs: block.schema }));
	}

	BlockVariantSchema = v.variant("type", blockOptions) as v.GenericSchema<RichTextElementNode>;

	return v.object({
		type: v.literal("doc"),
		content: v.array(BlockSchema),
	});
}
