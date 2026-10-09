import { type CalendarDate, type ZonedDateTime, parseAbsoluteToLocal, parseDate } from "@internationalized/date";
import { AlertCircle, ChevronDown, Plus } from "lucide-react";
import { type ReactNode, createContext, use, useId, useState } from "react";

import { type IssuesByPath, type Path, getNestedIssues, toDotPath } from "#/src/components/admin/data.ts";
import { FieldLabel } from "#/src/components/admin/field-label.tsx";
import { ImageControl } from "#/src/components/admin/image-control.tsx";
import type { Option } from "#/src/components/admin/options.ts";
import { RichTextEditor } from "#/src/components/admin/rich-text-editor.tsx";
import {
	DragHandle,
	InsertionZone,
	ItemActions,
	SortableAnnouncer,
	type SortableItems,
	useSortableItems,
} from "#/src/components/admin/sortable-items.tsx";
import { Badge } from "#/src/components/admin/ui/badge.tsx";
import { Button, buttonStyles } from "#/src/components/admin/ui/button.tsx";
import { Checkbox, CheckboxField, CheckboxGroup } from "#/src/components/admin/ui/checkbox.tsx";
import { ComboBox, ComboBoxContent, ComboBoxInput, ComboBoxItem } from "#/src/components/admin/ui/combo-box.tsx";
import { DatePicker, DatePickerTrigger } from "#/src/components/admin/ui/date-picker.tsx";
import { Description, FieldError, Fieldset as FieldsetPrimitive, Legend } from "#/src/components/admin/ui/field.tsx";
import { Input } from "#/src/components/admin/ui/input.tsx";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "#/src/components/admin/ui/menu.tsx";
import { NumberField, NumberInput } from "#/src/components/admin/ui/number-field.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger } from "#/src/components/admin/ui/select.tsx";
import { TextField } from "#/src/components/admin/ui/text-field.tsx";
import { Text } from "#/src/components/admin/ui/text.tsx";
import { Textarea } from "#/src/components/admin/ui/textarea.tsx";
import type {
	ArrayField,
	Block,
	Blocks,
	BlocksField,
	Field,
	Fields,
	ImageField,
	MultiSelectField,
	NumberField as NumberFieldDescriptor,
	ObjectField,
	ReferenceField,
	SelectField as SelectFieldDescriptor,
} from "#/src/lib/cms/schema/fields.ts";
import type { RichTextField } from "#/src/lib/cms/schema/rich-text.ts";

export interface FormContextValue {
	issues: IssuesByPath;
	/** Issues are only shown once the editor tried to save, rather than while they are still typing. */
	showIssues: boolean;
	referenceOptions: Readonly<Record<string, ReadonlyArray<Option>>>;
}

export const FormContext = createContext<FormContextValue>({
	issues: new Map(),
	showIssues: false,
	referenceOptions: {},
});

function useIssues(path: Path, nested = false): Array<string> {
	const { issues, showIssues } = use(FormContext);

	if (!showIssues) {
		return [];
	}

	const key = toDotPath(path);

	return nested ? getNestedIssues(issues, key) : [...(issues.get(key) ?? [])];
}

/** The key of the "None" option of optional selects, which cannot clash with an option value. */
const noneOption = "\u0000none";

/** Stored as iso dates, i.e. `yyyy-mm-dd`. */
function toCalendarDate(value: unknown): CalendarDate | null {
	try {
		return typeof value === "string" && value !== "" ? parseDate(value) : null;
	} catch {
		return null;
	}
}

/** Stored as utc iso timestamps, edited in the browser's time zone. */
function toZonedDateTime(value: unknown): ZonedDateTime | null {
	try {
		return typeof value === "string" && value !== "" ? parseAbsoluteToLocal(value) : null;
	} catch {
		return null;
	}
}

export interface FieldControlProps {
	field: Field;
	path: Path;
	value: unknown;
	onChange: (value: unknown) => void;
}

export function FieldControl(props: FieldControlProps): ReactNode {
	const { field, path, value, onChange } = props;
	const { referenceOptions } = use(FormContext);
	const errors = useIssues(path, field.kind === "richText");

	/** Validation is shown by the form, so react aria's own validation is turned off with `validationBehavior`. */
	const common = {
		isInvalid: errors.length > 0,
		validationBehavior: "aria" as const,
	};

	const label = <FieldLabel label={field.label} description={field.description} isOptional={field.optional} />;
	const error = <FieldError>{errors.join(" ")}</FieldError>;

	/** Optional fields store `undefined` rather than an empty string, which e.g. an email field would reject. */
	function onTextChange(text: string): void {
		onChange(field.optional === true && text === "" ? undefined : text);
	}

	if (field.readOnly === true) {
		return <ReadOnlyValue label={field.label} value={value} />;
	}

	switch (field.kind) {
		case "text":
		case "url":
		case "email": {
			return (
				<TextField {...common} type={field.kind} value={typeof value === "string" ? value : ""} onChange={onTextChange}>
					{label}
					<Input />
					{error}
				</TextField>
			);
		}

		case "textarea": {
			return (
				<TextField {...common} value={typeof value === "string" ? value : ""} onChange={onTextChange}>
					{label}
					<Textarea rows={3} />
					{error}
				</TextField>
			);
		}

		case "date": {
			return (
				<DatePicker
					{...common}
					value={toCalendarDate(value)}
					onChange={(date) => {
						onTextChange(date?.toString() ?? "");
					}}
					className="sm:max-inline-60"
				>
					{label}
					<DatePickerTrigger />
					{error}
				</DatePicker>
			);
		}

		case "datetime": {
			return (
				<DatePicker
					{...common}
					granularity="minute"
					value={toZonedDateTime(value)}
					onChange={(date) => {
						onTextChange(date?.toAbsoluteString() ?? "");
					}}
					className="sm:max-inline-80"
				>
					{label}
					<DatePickerTrigger />
					{error}
				</DatePicker>
			);
		}

		case "number": {
			return (
				<NumberField
					{...common}
					formatOptions={(field as NumberFieldDescriptor).integer ? { maximumFractionDigits: 0 } : undefined}
					value={typeof value === "number" ? value : Number.NaN}
					onChange={onChange}
					className="sm:max-inline-60"
				>
					{label}
					<NumberInput />
					{error}
				</NumberField>
			);
		}

		case "boolean": {
			return (
				<CheckboxField {...common} isSelected={value === true} onChange={onChange}>
					<Checkbox>{field.label}</Checkbox>
					{field.description != null && <Description>{field.description}</Description>}
					{error}
				</CheckboxField>
			);
		}

		case "select": {
			const { options } = field as SelectFieldDescriptor;
			/** A selection cannot be cleared otherwise. */
			const items = field.optional === true ? [{ value: noneOption, label: "None" }, ...options] : options;

			return (
				<Select
					{...common}
					value={typeof value === "string" && value !== "" ? value : null}
					onChange={(key) => {
						onTextChange(key == null || key === noneOption ? "" : String(key));
					}}
				>
					{label}
					<SelectTrigger />
					{error}
					<SelectContent items={items}>
						{(option) => <SelectItem id={option.value}>{option.label}</SelectItem>}
					</SelectContent>
				</Select>
			);
		}

		case "multiSelect": {
			return (
				<CheckboxGroup {...common} value={Array.isArray(value) ? (value as Array<string>) : []} onChange={onChange}>
					{label}
					{(field as MultiSelectField).options.map((option) => (
						<CheckboxField key={option.value} value={option.value}>
							<Checkbox>{option.label}</Checkbox>
						</CheckboxField>
					))}
					{error}
				</CheckboxGroup>
			);
		}

		case "reference": {
			const options = referenceOptions[(field as ReferenceField).collection] ?? [];

			return (
				<ComboBox
					{...common}
					defaultItems={options}
					menuTrigger="focus"
					value={typeof value === "string" && value !== "" ? value : null}
					onChange={(key) => {
						onTextChange(key == null ? "" : String(key));
					}}
				>
					{label}
					<ComboBoxInput placeholder="Search…" />
					{error}
					<ComboBoxContent>
						{(option: Option) => <ComboBoxItem id={option.id}>{option.label}</ComboBoxItem>}
					</ComboBoxContent>
				</ComboBox>
			);
		}

		case "image": {
			const options = referenceOptions[(field as ImageField).collection] ?? [];

			return (
				<ImageControl
					label={field.label}
					description={field.description}
					isOptional={field.optional}
					errors={errors}
					options={options}
					value={typeof value === "string" ? value : ""}
					onChange={(id) => {
						onChange(field.optional === true && id === "" ? undefined : id);
					}}
				/>
			);
		}

		case "object": {
			return <ObjectControl {...props} field={field as ObjectField} errors={errors} />;
		}

		case "array": {
			return <ArrayControl {...props} field={field as ArrayField} errors={errors} />;
		}

		case "blocks": {
			return <BlocksControl {...props} field={field as BlocksField} errors={errors} />;
		}

		case "richText": {
			return <RichTextEditor field={field as RichTextField} value={value} onChange={onChange} errors={errors} />;
		}

		default: {
			return <Text className="text-danger-subtle-fg">Unsupported field type "{field.kind}".</Text>;
		}
	}
}

function ReadOnlyValue(props: { label: string; value: unknown }): ReactNode {
	const { label, value } = props;

	return (
		<div className="flex flex-col gap-1">
			<span className="text-sm/6 font-medium text-fg">{label}</span>
			<span className="text-sm/6 break-all text-muted-fg">
				{typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "–"}
			</span>
		</div>
	);
}

/** Renders a group of fields, e.g. a collection's, an object's, or a block's. */
export function FieldsControl(props: {
	fields: Fields;
	path: Path;
	value: unknown;
	onChange: (value: unknown) => void;
}): ReactNode {
	const { fields, path, value, onChange } = props;
	const data = value != null && typeof value === "object" ? (value as Record<string, unknown>) : {};

	return (
		<div className="flex flex-col gap-6">
			{Object.entries(fields).map(([name, field]) => (
				<FieldControl
					key={name}
					field={field}
					path={[...path, name]}
					value={data[name]}
					onChange={(fieldValue) => {
						const next = { ...data };

						if (fieldValue === undefined) {
							// oxlint-disable-next-line typescript/no-dynamic-delete
							delete next[name];
						} else {
							next[name] = fieldValue;
						}

						onChange(next);
					}}
				/>
			))}
		</div>
	);
}

function Fieldset(props: {
	legend: string;
	description?: string;
	errors: Array<string>;
	children: ReactNode;
}): ReactNode {
	const { legend, description, errors, children } = props;

	return (
		<FieldsetPrimitive className="flex flex-col gap-4 rounded-lg border border-border bg-muted/50 p-4 min-inline-0">
			<Legend className="px-1 text-sm/6">{legend}</Legend>
			{description != null && <Text className="-mbs-3">{description}</Text>}
			{children}
			{errors.length > 0 && <Text className="text-danger-subtle-fg">{errors.join(" ")}</Text>}
		</FieldsetPrimitive>
	);
}

function ObjectControl(props: FieldControlProps & { field: ObjectField; errors: Array<string> }): ReactNode {
	const { field, path, value, onChange, errors } = props;

	return (
		<Fieldset legend={field.label} description={field.description} errors={errors}>
			<FieldsControl fields={field.fields} path={path} value={value} onChange={onChange} />
		</Fieldset>
	);
}

function ArrayControl(props: FieldControlProps & { field: ArrayField; errors: Array<string> }): ReactNode {
	const { field, path, value, onChange, errors } = props;
	const items = Array.isArray(value) ? (value as Array<unknown>) : [];

	function getLabel(index: number): string {
		return `${field.item.label} ${String(index + 1)}`;
	}

	const sortable = useSortableItems({ items, onChange, getLabel });

	return (
		<Fieldset legend={field.label} description={field.description} errors={errors}>
			{items.length > 0 && (
				<ol className="flex flex-col gap-3">
					{items.map((item, index) => {
						const label = getLabel(index);

						return (
							<li key={sortable.keys[index]}>
								<InsertionZone sortable={sortable} position={index} label={`before ${label}`} className="mbe-3" />
								{/* The item actions go below the field on narrow viewports, where they would leave it too little room. */}
								<div
									className={`grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${sortable.dragging === index ? "opacity-50" : ""}`}
								>
									<div className="pbe-1">
										<DragHandle sortable={sortable} index={index} label={label} />
									</div>
									<div className="flex-1 min-inline-0">
										<FieldControl
											field={{ ...field.item, label }}
											path={[...path, index]}
											value={item}
											onChange={(itemValue) => {
												sortable.update(index, itemValue);
											}}
										/>
									</div>
									<div className="col-start-2 justify-self-end pbe-1 sm:col-start-auto">
										<ItemActions label={label} index={index} sortable={sortable} />
									</div>
								</div>
								{index === items.length - 1 && (
									<InsertionZone sortable={sortable} position={items.length} label="at the end" className="mbs-3" />
								)}
							</li>
						);
					})}
				</ol>
			)}
			<SortableAnnouncer sortable={sortable} />
			<div>
				<Button
					intent="outline"
					size="sm"
					onPress={() => {
						sortable.add(field.item.defaultValue());
					}}
				>
					<Plus aria-hidden={true} />
					Add {field.item.label.toLowerCase()}
				</Button>
			</div>
		</Fieldset>
	);
}

interface BlockValue {
	type: string;
	data: unknown;
}

/** The first text of a block, e.g. its title - to tell sections apart while they are collapsed. */
function getBlockSummary(block: Block, data: unknown): string | undefined {
	const values = data != null && typeof data === "object" ? (data as Record<string, unknown>) : {};

	for (const [name, field] of Object.entries(block.fields)) {
		const value = values[name];

		if ((field.kind === "text" || field.kind === "textarea") && typeof value === "string" && value.trim() !== "") {
			return value;
		}
	}

	return undefined;
}

function BlockItem(props: {
	item: BlockValue;
	block: Block | undefined;
	index: number;
	label: string;
	path: Path;
	isCollapsed: boolean;
	onToggle: () => void;
	sortable: SortableItems<BlockValue>;
}): ReactNode {
	const { item, block, index, label, path, isCollapsed, onToggle, sortable } = props;
	const count = sortable.keys.length;
	/** Collapsed sections hide their fields' errors, so they are summarised in the header instead. */
	const hasErrors = useIssues([...path, index], true).length > 0;
	const contentId = useId();
	const summary = block != null ? getBlockSummary(block, item.data) : undefined;

	return (
		<li>
			<InsertionZone sortable={sortable} position={index} label={`before ${label}`} className="mbe-3" />
			<div
				className={`rounded-lg border border-border bg-bg p-2 shadow-xs ${sortable.dragging === index ? "opacity-50" : ""}`}
			>
				<div className="flex items-center gap-1">
					<DragHandle sortable={sortable} index={index} label={label} />
					<Button
						intent="plain"
						size="sm"
						aria-expanded={!isCollapsed}
						aria-controls={contentId}
						onPress={onToggle}
						className="flex-1 justify-start min-inline-0"
					>
						<ChevronDown
							aria-hidden={true}
							className={`shrink-0 transition-transform block-4 inline-4 ${isCollapsed ? "-rotate-90" : ""}`}
						/>
						<span className="shrink-0">{label}</span>
						{isCollapsed && summary != null && (
							<span className="truncate font-normal text-muted-fg min-inline-0">{summary}</span>
						)}
					</Button>
					{isCollapsed && hasErrors && (
						<Badge intent="danger" className="shrink-0">
							<AlertCircle aria-hidden={true} data-slot="icon" />
							Has errors
						</Badge>
					)}
					<ItemActions label={label} index={index} sortable={sortable} />
				</div>
				<div id={contentId} hidden={isCollapsed} className="px-2 pbs-4 pbe-2">
					{block != null ? (
						<FieldsControl
							fields={block.fields}
							path={[...path, index, "data"]}
							value={item.data}
							onChange={(data) => {
								sortable.update(index, { ...item, data });
							}}
						/>
					) : (
						<Text className="text-danger-subtle-fg">Unknown block type "{item.type}".</Text>
					)}
				</div>
			</div>
			{index === count - 1 && (
				<InsertionZone sortable={sortable} position={count} label="at the end" className="mbs-3" />
			)}
		</li>
	);
}

function BlocksControl(props: FieldControlProps & { field: BlocksField; errors: Array<string> }): ReactNode {
	const { field, path, value, onChange, errors } = props;
	const items = Array.isArray(value) ? (value as Array<BlockValue>) : [];
	const blocks: Blocks = field.blocks;

	function getLabel(index: number): string {
		const item = items[index]!;

		return `${blocks[item.type]?.label ?? item.type} ${String(index + 1)}`;
	}

	const sortable = useSortableItems({ items, onChange, getLabel });
	/** By item key, so that it moves along with its item. */
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	const isAllCollapsed = sortable.keys.every((key) => collapsed.has(key));

	return (
		<Fieldset legend={field.label} description={field.description} errors={errors}>
			{items.length > 0 && (
				<ol className="flex flex-col gap-3">
					{items.map((item, index) => {
						const key = sortable.keys[index]!;

						return (
							<BlockItem
								key={key}
								item={item}
								block={blocks[item.type]}
								index={index}
								label={getLabel(index)}
								path={path}
								isCollapsed={collapsed.has(key)}
								onToggle={() => {
									const next = new Set(collapsed);

									if (!next.delete(key)) {
										next.add(key);
									}

									setCollapsed(next);
								}}
								sortable={sortable}
							/>
						);
					})}
				</ol>
			)}
			<SortableAnnouncer sortable={sortable} />
			<div className="flex flex-wrap items-center justify-between gap-2">
				<Menu>
					<MenuTrigger className={buttonStyles({ intent: "outline", size: "sm" })}>
						<Plus aria-hidden={true} />
						Add section
						<ChevronDown aria-hidden={true} />
					</MenuTrigger>
					<MenuContent
						placement="bottom start"
						items={Object.entries(blocks).map(([type, block]) => {
							return { id: type, label: block.label };
						})}
						onAction={(type) => {
							sortable.add({ type: String(type), data: blocks[String(type)]!.defaultValue() });
						}}
					>
						{(item) => (
							<MenuItem id={item.id} textValue={item.label}>
								<MenuLabel>{item.label}</MenuLabel>
							</MenuItem>
						)}
					</MenuContent>
				</Menu>
				{items.length > 1 && (
					<Button
						intent="plain"
						size="sm"
						onPress={() => {
							setCollapsed(isAllCollapsed ? new Set() : new Set(sortable.keys));
						}}
					>
						{isAllCollapsed ? "Expand all" : "Collapse all"}
					</Button>
				)}
			</div>
		</Fieldset>
	);
}
