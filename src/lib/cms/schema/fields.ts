import * as v from "valibot";

/**
 * Describes one field of a collection, singleton, or block. Validation is delegated to the valibot `schema`; everything
 * else is read by the admin ui to render a form widget, which is selected by `kind`.
 *
 * Field descriptors are imported by both the server and the admin ui, so they must not reference server-only code.
 */
export interface Field<TKind extends string = string, TSchema extends v.GenericSchema = v.GenericSchema> {
	readonly kind: TKind;
	readonly label: string;
	readonly description?: string;
	readonly optional?: boolean;
	/** Shown, but not editable in the admin ui - e.g. metadata of an uploaded file. */
	readonly readOnly?: boolean;
	readonly schema: TSchema;
	/** Used when creating a new entry. May be invalid, e.g. an empty title, which the editor has to fill in. */
	readonly defaultValue: () => v.InferOutput<TSchema>;
}

export type Fields = Readonly<Record<string, Field>>;

export type FieldsSchema<TFields extends Fields> = v.ObjectSchema<
	{ -readonly [K in keyof TFields]: TFields[K]["schema"] },
	undefined
>;

export type InferFields<TFields extends Fields> = v.InferOutput<FieldsSchema<TFields>>;

interface FieldParams<TValue> {
	label: string;
	description?: string;
	/** Additional valibot actions, e.g. `v.maxLength(300)`, applied after the field's own validation. */
	validation?: ReadonlyArray<v.GenericPipeItem<TValue, TValue>>;
}

/** Entry ids double as path segments in the repository and in urls. */
export const EntryIdSchema = v.pipe(
	v.string(),
	v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must only contain lowercase letters, digits, and single hyphens."),
);

/** `v.pipe()` only accepts a fixed number of arguments, which a runtime array of actions cannot be spread into. */
export function refine<TValue>(
	schema: v.GenericSchema<unknown, TValue>,
	validation: ReadonlyArray<v.GenericPipeItem<TValue, TValue>> = [],
): v.GenericSchema<TValue> {
	if (validation.length === 0) {
		return schema as v.GenericSchema<TValue>;
	}

	// oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unsafe-argument
	return v.pipe(schema, ...(validation as Array<any>)) as v.GenericSchema<TValue>;
}

export function optional<TField extends Field>(
	field: TField,
): Omit<TField, "defaultValue" | "optional" | "schema"> &
	Field<TField["kind"], v.OptionalSchema<TField["schema"], undefined>> & { readonly optional: true } {
	return {
		...field,
		optional: true,
		schema: v.optional(field.schema),
		defaultValue: () => undefined,
	};
}

export function readOnly<TField extends Field>(field: TField): TField & { readonly readOnly: true } {
	return { ...field, readOnly: true };
}

export type TextField = Field<"text", v.GenericSchema<string>>;

export function text(params: FieldParams<string>): TextField {
	const { label, description, validation } = params;

	return {
		kind: "text",
		label,
		description,
		schema: refine(v.pipe(v.string(), v.trim()), validation),
		defaultValue: () => "",
	};
}

export type TextareaField = Field<"textarea", v.GenericSchema<string>>;

export function textarea(params: FieldParams<string>): TextareaField {
	const { label, description, validation } = params;

	return {
		kind: "textarea",
		label,
		description,
		schema: refine(v.pipe(v.string(), v.trim()), validation),
		defaultValue: () => "",
	};
}

export type UrlField = Field<"url", v.GenericSchema<string>>;

export function url(params: FieldParams<string>): UrlField {
	const { label, description, validation } = params;

	return {
		kind: "url",
		label,
		description,
		schema: refine(v.pipe(v.string(), v.trim(), v.url()), validation),
		defaultValue: () => "",
	};
}

export type EmailField = Field<"email", v.GenericSchema<string>>;

export function email(params: FieldParams<string>): EmailField {
	const { label, description, validation } = params;

	return {
		kind: "email",
		label,
		description,
		schema: refine(v.pipe(v.string(), v.trim(), v.email()), validation),
		defaultValue: () => "",
	};
}

export interface NumberField extends Field<"number", v.GenericSchema<number>> {
	readonly integer: boolean;
}

export function number(params: FieldParams<number> & { integer?: boolean }): NumberField {
	const { label, description, validation, integer = false } = params;

	return {
		kind: "number",
		label,
		description,
		integer,
		schema: refine(integer ? v.pipe(v.number(), v.integer()) : v.number(), validation),
		defaultValue: () => 0,
	};
}

export type BooleanField = Field<"boolean", v.GenericSchema<boolean>>;

export function boolean(params: Omit<FieldParams<boolean>, "validation"> & { defaultValue?: boolean }): BooleanField {
	const { label, description, defaultValue = false } = params;

	return {
		kind: "boolean",
		label,
		description,
		schema: v.boolean(),
		defaultValue: () => defaultValue,
	};
}

/** Stored as an iso date string, i.e. `yyyy-mm-dd`, which sorts lexicographically. */
export type DateField = Field<"date", v.GenericSchema<string>>;

export function date(params: FieldParams<string>): DateField {
	const { label, description, validation } = params;

	return {
		kind: "date",
		label,
		description,
		schema: refine(v.pipe(v.string(), v.isoDate()), validation),
		defaultValue: () => "",
	};
}

/** Stored as an iso timestamp string, which sorts lexicographically when all values use the same timezone offset. */
export type DateTimeField = Field<"datetime", v.GenericSchema<string>>;

export function datetime(params: FieldParams<string>): DateTimeField {
	const { label, description, validation } = params;

	return {
		kind: "datetime",
		label,
		description,
		schema: refine(v.pipe(v.string(), v.isoTimestamp()), validation),
		defaultValue: () => "",
	};
}

export interface SelectOption<TValue extends string> {
	readonly value: TValue;
	readonly label: string;
}

export interface SelectField<TValue extends string = string> extends Field<"select", v.GenericSchema<TValue>> {
	readonly options: ReadonlyArray<SelectOption<TValue>>;
}

export function select<const TValue extends string>(params: {
	label: string;
	description?: string;
	options: ReadonlyArray<SelectOption<TValue>>;
	defaultValue: NoInfer<TValue>;
}): SelectField<TValue> {
	const { label, description, options, defaultValue } = params;

	return {
		kind: "select",
		label,
		description,
		options,
		schema: v.picklist(options.map((option) => option.value)),
		defaultValue: () => defaultValue,
	};
}

export interface MultiSelectField<TValue extends string = string> extends Field<
	"multiSelect",
	v.GenericSchema<Array<TValue>>
> {
	readonly options: ReadonlyArray<SelectOption<TValue>>;
}

export function multiSelect<const TValue extends string>(params: {
	label: string;
	description?: string;
	options: ReadonlyArray<SelectOption<TValue>>;
}): MultiSelectField<TValue> {
	const { label, description, options } = params;

	return {
		kind: "multiSelect",
		label,
		description,
		options,
		schema: v.pipe(
			v.array(v.picklist(options.map((option) => option.value))),
			v.check((values) => new Set(values).size === values.length, "Must not contain duplicates."),
		),
		defaultValue: () => [],
	};
}

/** Stores the id of an entry in another collection. The collection is referenced by its name in the cms config. */
export interface ReferenceField extends Field<"reference", v.GenericSchema<string>> {
	readonly collection: string;
}

export function reference(params: { label: string; description?: string; collection: string }): ReferenceField {
	const { label, description, collection } = params;

	return {
		kind: "reference",
		label,
		description,
		collection,
		schema: EntryIdSchema,
		defaultValue: () => "",
	};
}

/**
 * Stores the id of an entry in the media collection - like a reference, but edited with a media picker, and rendered as
 * an image.
 */
export interface ImageField extends Field<"image", v.GenericSchema<string>> {
	readonly collection: string;
}

export function image(params: { label: string; description?: string; collection?: string }): ImageField {
	const { label, description, collection = "media" } = params;

	return {
		kind: "image",
		label,
		description,
		collection,
		schema: EntryIdSchema,
		defaultValue: () => "",
	};
}

/** References and images both point to entries of another collection. */
export function isReferenceField(field: Field): field is ImageField | ReferenceField {
	return field.kind === "reference" || field.kind === "image";
}

export interface ObjectField<TFields extends Fields = Fields> extends Field<"object", FieldsSchema<TFields>> {
	readonly fields: TFields;
}

export function object<const TFields extends Fields>(params: {
	label: string;
	description?: string;
	fields: TFields;
}): ObjectField<TFields> {
	const { label, description, fields } = params;

	return {
		kind: "object",
		label,
		description,
		fields,
		schema: createFieldsSchema(fields),
		defaultValue: () => createDefaultValue(fields),
	};
}

export interface ArrayField<TItem extends Field = Field> extends Field<
	"array",
	v.GenericSchema<Array<v.InferOutput<TItem["schema"]>>>
> {
	readonly item: TItem;
}

export function array<TItem extends Field>(
	item: TItem,
	params: FieldParams<Array<v.InferOutput<TItem["schema"]>>>,
): ArrayField<TItem> {
	const { label, description, validation } = params;

	return {
		kind: "array",
		label,
		description,
		item,
		schema: refine(v.array(item.schema as v.GenericSchema<unknown, v.InferOutput<TItem["schema"]>>), validation),
		defaultValue: () => [],
	};
}

/** A named group of fields, used as a section of a `blocks` field, or as a custom node in a `richText` field. */
export interface Block<TFields extends Fields = Fields> {
	readonly label: string;
	readonly fields: TFields;
	readonly schema: FieldsSchema<TFields>;
	readonly defaultValue: () => InferFields<TFields>;
}

export function block<const TFields extends Fields>(params: { label: string; fields: TFields }): Block<TFields> {
	const { label, fields } = params;

	return {
		label,
		fields,
		schema: createFieldsSchema(fields),
		defaultValue: () => createDefaultValue(fields),
	};
}

export type Blocks = Readonly<Record<string, Block>>;

export type BlocksValue<TBlocks extends Blocks> = Array<
	{ [K in keyof TBlocks & string]: { type: K; data: InferFields<TBlocks[K]["fields"]> } }[keyof TBlocks & string]
>;

/** An ordered list of sections, each of which is one of the given blocks, e.g. for page builders. */
export interface BlocksField<TBlocks extends Blocks = Blocks> extends Field<
	"blocks",
	v.GenericSchema<BlocksValue<TBlocks>>
> {
	readonly blocks: TBlocks;
}

export function blocks<const TBlocks extends Blocks>(
	params: FieldParams<BlocksValue<TBlocks>> & { blocks: TBlocks },
): BlocksField<TBlocks> {
	const { label, description, validation, blocks } = params;

	const options = Object.entries(blocks).map(([type, block]) =>
		v.object({ type: v.literal(type), data: block.schema }),
	);

	return {
		kind: "blocks",
		label,
		description,
		blocks,
		schema: refine(
			// oxlint-disable-next-line typescript/no-explicit-any
			v.array(v.variant("type", options as Array<any>)) as v.GenericSchema<unknown, BlocksValue<TBlocks>>,
			validation,
		),
		defaultValue: () => [],
	};
}

export function createFieldsSchema<TFields extends Fields>(fields: TFields): FieldsSchema<TFields> {
	const entries = Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, field.schema]));

	return v.object(entries) as FieldsSchema<TFields>;
}

export function createDefaultValue<TFields extends Fields>(fields: TFields): InferFields<TFields> {
	const value: Record<string, unknown> = {};

	for (const [name, field] of Object.entries(fields)) {
		const defaultValue = field.defaultValue();

		if (defaultValue !== undefined) {
			value[name] = defaultValue;
		}
	}

	return value as InferFields<TFields>;
}
