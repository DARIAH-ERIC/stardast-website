import { FileText, ImageIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { ListBox, ListBoxItem } from "react-aria-components/ListBox";
import { tv } from "tailwind-variants";

import { FieldLabel } from "#/src/components/admin/field-label.tsx";
import { MediaUploader } from "#/src/components/admin/media-uploader.tsx";
import type { Option } from "#/src/components/admin/options.ts";
import { Button } from "#/src/components/admin/ui/button.tsx";
import {
	Modal,
	ModalBody,
	ModalClose,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from "#/src/components/admin/ui/modal.tsx";
import { SearchField, SearchInput } from "#/src/components/admin/ui/search-field.tsx";
import { Text } from "#/src/components/admin/ui/text.tsx";

function Thumbnail(props: { option: Option; className?: string }): ReactNode {
	const { option, className = "size-24" } = props;

	return option.thumbnailUrl != null ? (
		<img src={option.thumbnailUrl} alt="" className={`${className} rounded-md bg-muted object-contain`} />
	) : (
		<span
			className={`${className} flex flex-col items-center justify-center gap-1 rounded-md bg-muted text-xs text-muted-fg uppercase`}
		>
			<FileText aria-hidden={true} className="block-5 inline-5" />
			{option.contentType?.split("/")[1] ?? "file"}
		</span>
	);
}

/**
 * The media library uses react aria's `ListBox` directly: intent ui's list box items are styled as rows of a dropdown,
 * not as tiles of a grid.
 */
const optionStyles = tv({
	base: "flex cursor-default flex-col items-center gap-2 rounded-lg border p-2 text-xs text-fg -outline-offset-2 outline-ring",
	variants: {
		isSelected: {
			false: "border-border hover:bg-muted",
			true: "border-primary bg-primary-subtle ring-1 ring-primary",
		},
		isFocusVisible: {
			true: "outline-2",
		},
	},
});

export function ImageControl(props: {
	label: string;
	description?: string;
	isOptional?: boolean;
	errors: ReadonlyArray<string>;
	value: string;
	onChange: (value: string) => void;
	options: ReadonlyArray<Option>;
}): ReactNode {
	const { label, description, isOptional, errors, value, onChange } = props;
	/** Uploaded while the editor is open, so not part of the options loaded with the page. */
	const [uploaded, setUploaded] = useState<Array<Option>>([]);
	const [query, setQuery] = useState("");
	const [isOpen, setOpen] = useState(false);
	const labelId = useId();
	const descriptionId = useId();

	const options = [...uploaded, ...props.options];
	const selected = options.find((option) => option.id === value);
	const visible = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));

	return (
		<div
			role="group"
			aria-labelledby={labelId}
			aria-describedby={description != null ? descriptionId : undefined}
			className="flex flex-col gap-1"
		>
			<FieldLabel
				label={label}
				description={description}
				isOptional={isOptional}
				labelId={labelId}
				descriptionId={descriptionId}
				elementType="span"
			/>
			<div
				className={`mbs-1 flex items-center gap-4 rounded-lg border p-2 ${errors.length > 0 ? "border-danger-subtle-fg/70" : "border-input"}`}
			>
				{selected != null ? (
					<>
						<Thumbnail option={selected} className="block-16 inline-16" />
						<span className="flex-1 truncate text-sm/6 text-fg min-inline-0">{selected.label}</span>
					</>
				) : (
					<span className="flex flex-1 items-center gap-3 text-sm/6 text-muted-fg">
						<span className="flex items-center justify-center rounded-md bg-muted block-16 inline-16">
							<ImageIcon aria-hidden={true} className="block-5 inline-5" />
						</span>
						{value !== "" ? `Missing media "${value}"` : "No image selected."}
					</span>
				)}
				<Modal isOpen={isOpen} onOpenChange={setOpen}>
					<Button intent="outline" size="sm">
						{selected != null ? "Change" : "Choose"}
					</Button>
					<ModalContent size="3xl">
						<ModalHeader>
							<ModalTitle>Choose {label.toLowerCase()}</ModalTitle>
						</ModalHeader>
						<ModalBody className="gap-4">
							<MediaUploader
								allowsMultiple={false}
								onUploaded={(option) => {
									setUploaded((current) => [option, ...current]);
									onChange(option.id);
									setOpen(false);
								}}
							/>
							<SearchField aria-label="Search the media library" value={query} onChange={setQuery}>
								<SearchInput placeholder="Search the media library…" />
							</SearchField>
							<ListBox
								aria-label="Media library"
								layout="grid"
								items={visible}
								selectionMode="single"
								selectedKeys={value !== "" ? [value] : []}
								onSelectionChange={(keys) => {
									const [key] = keys === "all" ? [] : [...keys];

									if (key != null) {
										onChange(String(key));
										setOpen(false);
									}
								}}
								renderEmptyState={() => <Text className="col-span-full">No media found.</Text>}
								className="grid grid-cols-2 gap-3 overflow-auto p-0.5 outline-0 max-block-96 sm:grid-cols-4"
							>
								{(option) => (
									<ListBoxItem id={option.id} textValue={option.label} className={optionStyles}>
										<Thumbnail option={option} />
										<span className="truncate text-center inline-full">{option.label}</span>
									</ListBoxItem>
								)}
							</ListBox>
						</ModalBody>
						<ModalFooter>
							<ModalClose>Close</ModalClose>
						</ModalFooter>
					</ModalContent>
				</Modal>
				{isOptional === true && value !== "" && (
					<Button
						intent="plain"
						size="sm"
						onPress={() => {
							onChange("");
						}}
					>
						Remove
					</Button>
				)}
			</div>
			{errors.length > 0 && <Text className="mbs-1 text-danger-subtle-fg">{errors.join(" ")}</Text>}
		</div>
	);
}
