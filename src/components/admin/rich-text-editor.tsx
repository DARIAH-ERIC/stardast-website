import { type Extensions, type JSONContent, Node } from "@tiptap/core";
import { Subscript as SubscriptExtension } from "@tiptap/extension-subscript";
import { Superscript as SuperscriptExtension } from "@tiptap/extension-superscript";
import {
	type Editor,
	EditorContent,
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
	useEditor,
	useEditorState,
} from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import {
	Bold,
	ChevronDown,
	Code,
	GripVertical,
	Italic,
	Link as LinkIcon,
	List,
	ListOrdered,
	type LucideIcon,
	Minus,
	Plus,
	Quote,
	Redo2,
	SquareCode,
	Strikethrough,
	Subscript,
	Superscript,
	Trash2,
	Underline,
	Undo2,
} from "lucide-react";
import { type ReactNode, use, useId, useMemo, useState } from "react";
import { Form } from "react-aria-components/Form";

import { groupIssues, validate } from "#/src/components/admin/data.ts";
import { FieldsControl, FormContext } from "#/src/components/admin/field-control.tsx";
import { FieldLabel } from "#/src/components/admin/field-label.tsx";
import { Button, buttonStyles } from "#/src/components/admin/ui/button.tsx";
import { Dialog } from "#/src/components/admin/ui/dialog.tsx";
import { FieldError, Label } from "#/src/components/admin/ui/field.tsx";
import { Input } from "#/src/components/admin/ui/input.tsx";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "#/src/components/admin/ui/menu.tsx";
import { Popover, PopoverContent } from "#/src/components/admin/ui/popover.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger } from "#/src/components/admin/ui/select.tsx";
import { TextField } from "#/src/components/admin/ui/text-field.tsx";
import { Text } from "#/src/components/admin/ui/text.tsx";
import { Toolbar, ToolbarGroup, ToolbarItem, ToolbarSeparator } from "#/src/components/admin/ui/toolbar.tsx";
import type { Block } from "#/src/lib/cms/schema/fields.ts";
import { type RichTextField, type RichTextMarkType, isSafeHref } from "#/src/lib/cms/schema/rich-text.ts";

/**
 * Custom blocks are atom nodes - not editable as rich text - whose attributes hold the block's field values, edited
 * with the same form widgets as top-level fields.
 */
function createBlockNode(name: string, block: Block): Node {
	const defaults = block.defaultValue() as Record<string, unknown>;

	return Node.create({
		name,
		group: "block",
		atom: true,
		draggable: true,
		selectable: true,

		addOptions() {
			return { block };
		},

		addAttributes() {
			return Object.fromEntries(
				Object.keys(block.fields).map((key) => [
					key,
					{
						default: defaults[key],
						/** All attributes are serialised together into `data-attrs`, see `renderHTML()`. */
						rendered: false,
						parseHTML(element: HTMLElement) {
							const attrs = JSON.parse(element.dataset.attrs ?? "{}") as Record<string, unknown>;
							return attrs[key] ?? defaults[key];
						},
					},
				]),
			);
		},

		/** Used for copy and paste, within and between editors. */
		parseHTML() {
			return [{ tag: `div[data-cms-block="${name}"]` }];
		},

		renderHTML({ node }) {
			return ["div", { "data-cms-block": name, "data-attrs": JSON.stringify(node.attrs) }];
		},

		addNodeView() {
			return ReactNodeViewRenderer(BlockNodeView);
		},
	});
}

function BlockNodeView(props: NodeViewProps): ReactNode {
	const { node, updateAttributes, deleteNode, extension, selected } = props;
	const block = (extension.options as { block: Block }).block;
	const context = use(FormContext);

	/** Validated here, since issue paths from the whole document cannot be mapped back to a node. */
	const issues = useMemo(() => groupIssues(validate(block.schema, node.attrs)), [block, node.attrs]);

	return (
		<NodeViewWrapper
			data-selected={selected}
			className="not-prose my-4 rounded-lg border border-border bg-muted/50 p-4 data-[selected=true]:border-primary data-[selected=true]:ring-3 data-[selected=true]:ring-ring/20"
		>
			<div contentEditable={false} suppressContentEditableWarning={true}>
				<div className="mbe-4 flex items-center justify-between gap-2">
					<span data-drag-handle="" className="flex cursor-grab items-center gap-1.5 text-sm/6 font-medium text-fg">
						<GripVertical aria-hidden={true} className="text-muted-fg block-4 inline-4" />
						{block.label}
					</span>
					<Button intent="plain" size="sq-sm" aria-label={`Remove ${block.label}`} onPress={deleteNode}>
						<Trash2 aria-hidden={true} />
					</Button>
				</div>
				<FormContext value={{ ...context, issues }}>
					<FieldsControl
						fields={block.fields}
						path={[]}
						value={node.attrs}
						onChange={(attrs) => {
							updateAttributes(attrs as Record<string, unknown>);
						}}
					/>
				</FormContext>
			</div>
		</NodeViewWrapper>
	);
}

function createExtensions(field: RichTextField): Extensions {
	const marks = new Set(field.marks);
	const nodes = new Set(field.nodes);
	const hasLists = nodes.has("bulletList") || nodes.has("orderedList");

	/** Disabled extensions also disable their input rules, keyboard shortcuts, and paste handling. */
	return [
		StarterKit.configure({
			heading: nodes.has("heading") ? { levels: [...field.headingLevels] } : false,
			bulletList: nodes.has("bulletList") ? {} : false,
			orderedList: nodes.has("orderedList") ? {} : false,
			listItem: hasLists ? {} : false,
			listKeymap: hasLists ? {} : false,
			blockquote: nodes.has("blockquote") ? {} : false,
			codeBlock: nodes.has("codeBlock") ? {} : false,
			horizontalRule: nodes.has("horizontalRule") ? {} : false,
			bold: marks.has("bold") ? {} : false,
			italic: marks.has("italic") ? {} : false,
			underline: marks.has("underline") ? {} : false,
			strike: marks.has("strike") ? {} : false,
			code: marks.has("code") ? {} : false,
			link: marks.has("link")
				? {
						openOnClick: false,
						autolink: true,
						defaultProtocol: "https",
						isAllowedUri(url, { defaultValidate }) {
							return defaultValidate(url) && isSafeHref(url);
						},
					}
				: false,
		}),
		...(marks.has("subscript") ? [SubscriptExtension] : []),
		...(marks.has("superscript") ? [SuperscriptExtension] : []),
		...Object.entries(field.blocks).map(([name, block]) => createBlockNode(name, block)),
	];
}

const markButtons: Record<Exclude<RichTextMarkType, "link">, { label: string; icon: LucideIcon }> = {
	bold: { label: "Bold", icon: Bold },
	italic: { label: "Italic", icon: Italic },
	underline: { label: "Underline", icon: Underline },
	strike: { label: "Strikethrough", icon: Strikethrough },
	code: { label: "Code", icon: Code },
	subscript: { label: "Subscript", icon: Subscript },
	superscript: { label: "Superscript", icon: Superscript },
};

/** A toggle for an inline mark, or a block type. */
function toggle(key: string, name: string, Icon: LucideIcon, isSelected: boolean, onChange: () => void): ReactNode {
	return (
		<ToolbarItem key={key} aria-label={name} size="sq-sm" intent="plain" isSelected={isSelected} onChange={onChange}>
			<Icon aria-hidden={true} />
		</ToolbarItem>
	);
}

function EditorToolbar(props: { editor: Editor; field: RichTextField; label: string }): ReactNode {
	const { editor, field, label } = props;
	const nodes = new Set(field.nodes);

	const state = useEditorState({
		editor,
		selector({ editor }) {
			const level = field.headingLevels.find((level) => editor.isActive("heading", { level }));

			return {
				marks: Object.fromEntries(field.marks.map((mark) => [mark, editor.isActive(mark)])),
				textStyle: level != null ? `heading-${String(level)}` : "paragraph",
				bulletList: editor.isActive("bulletList"),
				orderedList: editor.isActive("orderedList"),
				blockquote: editor.isActive("blockquote"),
				codeBlock: editor.isActive("codeBlock"),
				canUndo: editor.can().undo(),
				canRedo: editor.can().redo(),
			};
		},
	});

	const textStyles = [
		{ id: "paragraph", label: "Paragraph" },
		...field.headingLevels.map((level) => {
			return { id: `heading-${String(level)}`, label: `Heading ${String(level)}` };
		}),
	];

	const blocks = Object.entries(field.blocks);

	return (
		<Toolbar
			aria-label={`${label} formatting`}
			className="flex flex-wrap gap-1 rounded-none border-be border-border bg-muted/50 p-1 inset-ring-0 inline-full"
		>
			{nodes.has("heading") && (
				<Select
					aria-label="Text style"
					value={state.textStyle}
					onChange={(style) => {
						const chain = editor.chain().focus();
						const level = Number(String(style).replace("heading-", "")) as 1 | 2 | 3 | 4 | 5 | 6;
						(style === "paragraph" ? chain.setParagraph() : chain.setHeading({ level })).run();
					}}
					className="inline-36"
				>
					<SelectTrigger className="bg-bg py-1 sm:py-[calc(--spacing(1)-1px)]" />
					<SelectContent items={textStyles}>
						{(item) => <SelectItem id={item.id}>{item.label}</SelectItem>}
					</SelectContent>
				</Select>
			)}
			<ToolbarGroup aria-label="Text formatting">
				{field.marks
					.filter((mark) => mark !== "link")
					.map((mark) => {
						const { label: name, icon } = markButtons[mark];

						return toggle(mark, name, icon, state.marks[mark] === true, () => {
							editor.chain().focus().toggleMark(mark).run();
						});
					})}
				{field.marks.includes("link") && <LinkButton editor={editor} isActive={state.marks.link === true} />}
			</ToolbarGroup>
			<ToolbarSeparator />
			<ToolbarGroup aria-label="Blocks">
				{nodes.has("bulletList") &&
					toggle("bulletList", "Bulleted list", List, state.bulletList, () => {
						editor.chain().focus().toggleBulletList().run();
					})}
				{nodes.has("orderedList") &&
					toggle("orderedList", "Numbered list", ListOrdered, state.orderedList, () => {
						editor.chain().focus().toggleOrderedList().run();
					})}
				{nodes.has("blockquote") &&
					toggle("blockquote", "Quote", Quote, state.blockquote, () => {
						editor.chain().focus().toggleBlockquote().run();
					})}
				{nodes.has("codeBlock") &&
					toggle("codeBlock", "Code block", SquareCode, state.codeBlock, () => {
						editor.chain().focus().toggleCodeBlock().run();
					})}
				{nodes.has("horizontalRule") && (
					<Button
						intent="plain"
						size="sq-sm"
						aria-label="Horizontal rule"
						onPress={() => {
							editor.chain().focus().setHorizontalRule().run();
						}}
					>
						<Minus aria-hidden={true} />
					</Button>
				)}
				{blocks.length > 0 && (
					<Menu>
						<MenuTrigger className={buttonStyles({ intent: "plain", size: "sm" })}>
							<Plus aria-hidden={true} />
							Insert
							<ChevronDown aria-hidden={true} />
						</MenuTrigger>
						<MenuContent
							placement="bottom start"
							items={blocks.map(([type, block]) => {
								return { id: type, label: block.label };
							})}
							onAction={(type) => {
								const block = field.blocks[String(type)]!;
								editor
									.chain()
									.focus()
									.insertContent({ type: String(type), attrs: block.defaultValue() })
									.run();
							}}
						>
							{(item) => (
								<MenuItem id={item.id} textValue={item.label}>
									<MenuLabel>{item.label}</MenuLabel>
								</MenuItem>
							)}
						</MenuContent>
					</Menu>
				)}
			</ToolbarGroup>
			<ToolbarSeparator />
			<ToolbarGroup aria-label="History">
				<Button
					intent="plain"
					size="sq-sm"
					aria-label="Undo"
					isDisabled={!state.canUndo}
					onPress={() => {
						editor.chain().focus().undo().run();
					}}
				>
					<Undo2 aria-hidden={true} />
				</Button>
				<Button
					intent="plain"
					size="sq-sm"
					aria-label="Redo"
					isDisabled={!state.canRedo}
					onPress={() => {
						editor.chain().focus().redo().run();
					}}
				>
					<Redo2 aria-hidden={true} />
				</Button>
			</ToolbarGroup>
		</Toolbar>
	);
}

function LinkButton(props: { editor: Editor; isActive: boolean }): ReactNode {
	const { editor, isActive } = props;
	const [isOpen, setOpen] = useState(false);
	const [href, setHref] = useState("");
	const [error, setError] = useState<string>();

	return (
		<Popover
			isOpen={isOpen}
			onOpenChange={(isOpen) => {
				if (isOpen) {
					setHref((editor.getAttributes("link") as { href?: string }).href ?? "");
					setError(undefined);
				}
				setOpen(isOpen);
			}}
		>
			<ToolbarItem aria-label="Link" size="sq-sm" intent="plain" isSelected={isActive}>
				<LinkIcon aria-hidden={true} />
			</ToolbarItem>
			<PopoverContent placement="bottom start">
				<Dialog aria-label="Link">
					<Form
						className="flex flex-col gap-4 p-4 inline-80 max-inline-full"
						onSubmit={(event) => {
							event.preventDefault();
							const url = href.trim();

							if (!isSafeHref(url)) {
								setError("Enter an http(s), mailto, tel, or relative url.");
								return;
							}

							const chain = editor.chain().focus().extendMarkRange("link");

							if (editor.state.selection.empty && !isActive) {
								chain.insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] }).run();
							} else {
								chain.setLink({ href: url }).run();
							}

							setOpen(false);
						}}
					>
						<TextField
							value={href}
							onChange={setHref}
							isInvalid={error != null}
							validationBehavior="aria"
							autoFocus={true}
						>
							<Label>Url</Label>
							<Input placeholder="https://" />
							<FieldError>{error}</FieldError>
						</TextField>
						<div className="flex justify-end gap-2">
							{isActive && (
								<Button
									intent="plain"
									size="sm"
									onPress={() => {
										editor.chain().focus().extendMarkRange("link").unsetLink().run();
										setOpen(false);
									}}
								>
									Remove link
								</Button>
							)}
							<Button type="submit" size="sm">
								Apply
							</Button>
						</div>
					</Form>
				</Dialog>
			</PopoverContent>
		</Popover>
	);
}

export function RichTextEditor(props: {
	field: RichTextField;
	value: unknown;
	onChange: (value: unknown) => void;
	errors: ReadonlyArray<string>;
}): ReactNode {
	const { field, value, onChange, errors } = props;
	const labelId = useId();
	const errorId = useId();

	const editor = useEditor({
		extensions: useMemo(() => createExtensions(field), [field]),
		/** Read once: the editor owns the document afterwards, and reports changes via `onUpdate`. */
		content: value as JSONContent,
		editorProps: {
			attributes: {
				"aria-labelledby": labelId,
				...(errors.length > 0 ? { "aria-invalid": "true", "aria-describedby": errorId } : {}),
				class: "prose max-w-none min-h-48 px-4 py-3 outline-none",
			},
		},
		onUpdate({ editor }) {
			onChange(editor.getJSON());
		},
	});

	return (
		<div className="flex flex-col gap-1">
			<FieldLabel
				label={field.label}
				description={field.description}
				isOptional={field.optional}
				labelId={labelId}
				elementType="span"
			/>
			<div
				className={`mbs-1 overflow-hidden rounded-lg border transition has-[.ProseMirror-focused]:border-ring/70 has-[.ProseMirror-focused]:ring-3 has-[.ProseMirror-focused]:ring-ring/20 ${errors.length > 0 ? "border-danger-subtle-fg/70" : "border-input"}`}
			>
				<EditorToolbar editor={editor} field={field} label={field.label} />
				<EditorContent editor={editor} />
			</div>
			{errors.length > 0 && (
				<Text id={errorId} className="mbs-1 text-danger-subtle-fg">
					{errors.join(" ")}
				</Text>
			)}
		</div>
	);
}
