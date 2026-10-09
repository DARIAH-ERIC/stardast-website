import {
	array,
	blocks,
	boolean,
	date,
	datetime,
	email,
	image,
	multiSelect,
	number,
	object,
	reference,
	select,
	text,
	textarea,
	url,
} from "#/src/lib/cms/schema/fields.ts";
import { richText } from "#/src/lib/cms/schema/rich-text.ts";

export {
	collection,
	type CollectionName,
	type Config,
	defineConfig,
	forEachField,
	type InferEntry,
	singleton,
	type SingletonName,
} from "#/src/lib/cms/schema/config.ts";
export { block, EntryIdSchema, isReferenceField, optional, readOnly } from "#/src/lib/cms/schema/fields.ts";
export type { RichTextDocument, RichTextElementNode, RichTextNode } from "#/src/lib/cms/schema/rich-text.ts";

export const fields = {
	array,
	blocks,
	boolean,
	date,
	datetime,
	email,
	image,
	multiSelect,
	number,
	object,
	reference,
	richText,
	select,
	text,
	textarea,
	url,
};
