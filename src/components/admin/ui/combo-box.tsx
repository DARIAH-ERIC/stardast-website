import { ChevronsUpDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "react-aria-components/Button";
import {
	ComboBox as ComboBoxPrimitive,
	type ComboBoxProps as ComboBoxPrimitiveProps,
	ComboBoxValue as ComboBoxValuePrimitive,
	type ComboBoxValueProps,
} from "react-aria-components/ComboBox";
import type { InputProps } from "react-aria-components/Input";
import { ListBox, type ListBoxProps } from "react-aria-components/ListBox";
import type { PopoverProps } from "react-aria-components/Popover";

import {
	DropdownDescription,
	DropdownItem,
	DropdownLabel,
	DropdownSection,
} from "#/src/components/admin/ui/dropdown.tsx";
import { fieldStyles } from "#/src/components/admin/ui/field.tsx";
import { Input } from "#/src/components/admin/ui/input.tsx";
import { PopoverContent } from "#/src/components/admin/ui/popover.tsx";
import { cx } from "#/src/components/admin/ui/primitive.ts";

interface ComboBoxProps<T extends object, M extends "single" | "multiple" = "single"> extends Omit<
	ComboBoxPrimitiveProps<T, M>,
	"children"
> {
	children: React.ReactNode;
}

const ComboBox = <T extends object, M extends "single" | "multiple" = "single">({
	className,
	...props
}: ComboBoxProps<T, M>): ReactNode => (
	<ComboBoxPrimitive data-slot="control" className={cx(fieldStyles(), className)} {...props} />
);

interface ComboBoxListProps<T extends object>
	extends Omit<ListBoxProps<T>, "layout" | "orientation">, Pick<PopoverProps, "placement"> {
	popover?: Omit<PopoverProps, "children">;
}

const ComboBoxContent = <T extends object>({
	children,
	items,
	className,
	popover,
	...props
}: ComboBoxListProps<T>): ReactNode => (
	<PopoverContent
		placement={popover?.placement ?? "bottom"}
		className={cx(
			"overflow-hidden min-inline-(--trigger-width) *:data-[slot=popover-inner]:overflow-hidden",
			popover?.className,
		)}
		{...popover}
	>
		<ListBox
			layout="stack"
			orientation="vertical"
			className={cx(
				"grid grid-cols-[auto_1fr] flex-col gap-y-1 overflow-y-auto p-1 outline-hidden inline-full max-block-[inherit] *:[[role='group']+[role=group]]:mbs-4 *:[[role='group']+[role=separator]]:mbs-1",
				className,
			)}
			items={items}
			{...props}
		>
			{children}
		</ListBox>
	</PopoverContent>
);

const ComboBoxInput = (props: InputProps): ReactNode => (
	<span data-slot="control" className="relative isolate block has-[[data-slot=icon]:last-child]:[&_input]:pe-10">
		<Input {...props} />
		<Button className="absolute inset-e-0 inset-bs-0 grid cursor-default place-content-center block-full inline-11 sm:inline-9">
			<ChevronsUpDownIcon data-slot="chevron" className="-me-1 text-muted-fg block-5 inline-5 sm:block-4 sm:inline-4" />
		</Button>
	</span>
);

const ComboBoxSection = DropdownSection;
const ComboBoxItem = DropdownItem;
const ComboBoxLabel = DropdownLabel;
const ComboBoxDescription = DropdownDescription;
const ComboBoxValue = <T extends object>(props: ComboBoxValueProps<T>): ReactNode => (
	<ComboBoxValuePrimitive data-slot="control" {...props} />
);

export type { ComboBoxListProps, ComboBoxProps };
export {
	ComboBox,
	ComboBoxContent,
	ComboBoxDescription,
	ComboBoxInput,
	ComboBoxItem,
	ComboBoxLabel,
	ComboBoxSection,
	ComboBoxValue,
};
