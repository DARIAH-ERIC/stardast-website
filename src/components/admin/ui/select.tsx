import { ChevronsUpDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "react-aria-components/Button";
import { ListBox, type ListBoxProps } from "react-aria-components/ListBox";
import type { PopoverProps } from "react-aria-components/Popover";
import {
	Select as SelectPrimitive,
	type SelectProps as SelectPrimitiveProps,
	SelectValue,
} from "react-aria-components/Select";
import { twJoin } from "tailwind-merge";

import {
	DropdownDescription,
	DropdownItem,
	DropdownLabel,
	DropdownSection,
	DropdownSeparator,
} from "#/src/components/admin/ui/dropdown.tsx";
import { fieldStyles } from "#/src/components/admin/ui/field.tsx";
import { PopoverContent } from "#/src/components/admin/ui/popover.tsx";
import { cx } from "#/src/components/admin/ui/primitive.ts";

interface SelectProps<T extends object, M extends "single" | "multiple" = "single"> extends SelectPrimitiveProps<T, M> {
	items?: Iterable<T, M>;
}

const Select = <T extends object, M extends "single" | "multiple" = "single">({
	className,
	...props
}: SelectProps<T, M>): ReactNode => (
	<SelectPrimitive
		data-slot="control"
		className={cx(fieldStyles({ className: "group/select" }), className)}
		{...props}
	/>
);

interface SelectListProps<T extends object> extends Omit<ListBoxProps<T>, "layout" | "orientation"> {
	items?: Iterable<T>;
	popover?: Omit<PopoverProps, "children">;
}

const SelectContent = <T extends object>({ items, className, popover, ...props }: SelectListProps<T>): ReactNode => (
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
		/>
	</PopoverContent>
);

interface SelectTriggerProps extends React.ComponentProps<typeof Button> {
	prefix?: React.ReactNode;
	className?: string;
}

const SelectTrigger = ({ children, className, ...props }: SelectTriggerProps): ReactNode => (
	<span data-slot="control" className="relative block inline-full">
		<Button
			className={cx(
				"group/select-trigger flex cursor-default items-center gap-x-2 rounded-lg border border-input bg-(--control-bg,transparent) px-[calc(--spacing(3.5)-1px)] py-[calc(--spacing(2.5)-1px)] text-start text-fg outline-hidden inline-full min-inline-0 sm:px-[calc(--spacing(3)-1px)] sm:py-[calc(--spacing(1.5)-1px)] sm:text-sm/6 sm:*:text-sm/6 dark:shadow-none",
				"focus:border-ring/70 focus:ring-3 focus:ring-ring/20 focus:enabled:hover:border-ring/80",
				"enabled:hover:border-muted-fg/30",
				"group-open/select:border-ring/70 group-open/select:ring-3 group-open/select:ring-ring/20",
				"group-invalid/select:border-danger-subtle-fg/70 group-invalid/select:ring-danger-subtle-fg/20 group-invalid/select:enabled:hover:border-danger-subtle-fg/80 group-focus/select:group-invalid/select:border-danger-subtle-fg/70 group-focus/select:group-invalid/select:ring-danger-subtle-fg/20 group-focus/select:group-invalid/select:enabled:hover:border-danger-subtle-fg/80 group-open/select:invalid:border-danger-subtle-fg/70 group-open/select:invalid:ring-3 group-open/select:invalid:ring-danger-subtle-fg/20",
				"forced-colors:[--btn-icon:ButtonText] forced-colors:hover:[--btn-icon:ButtonText] *:[svg]:shrink-0 *:[svg]:self-center *:[svg]:text-(--btn-icon) *:[svg]:block-5 *:[svg]:inline-5 focus-visible:*:[svg]:text-(--btn-icon-active)/80 enabled:hover:*:[svg]:text-(--btn-icon-active)/90 sm:*:[svg]:block-4 sm:*:[svg]:inline-4 pressed:*:[svg]:text-(--btn-icon-active)",
				"*:data-[slot=loader]:shrink-0 *:data-[slot=loader]:self-center *:data-[slot=loader]:text-(--btn-icon) *:data-[slot=loader]:block-5 *:data-[slot=loader]:inline-5 sm:*:data-[slot=loader]:block-4 sm:*:data-[slot=loader]:inline-4",
				"forced-colors:group-invalid/select:border-[Mark] forced-colors:group-focus/select:border-[Highlight] forced-colors:group-focus/select:group-invalid/select:border-[Mark]",
				"group-disabled/select:bg-muted group-disabled/select:opacity-50 forced-colors:group-disabled/select:border-[GrayText] forced-colors:group-disabled/select:text-[GrayText]",
				"in-disabled:bg-muted in-disabled:opacity-50 forced-colors:in-disabled:border-[GrayText] forced-colors:in-disabled:text-[GrayText]",
				"dark:scheme-dark",
				className,
			)}
		>
			{(values) => (
				<>
					{props.prefix != null && <span className="text-muted-fg">{props.prefix}</span>}
					{typeof children === "function" ? children(values) : children}

					{children == null && (
						<>
							<SelectValue
								data-slot="select-value"
								className={twJoin([
									"truncate text-start data-placeholder:text-muted-fg sm:text-sm/6 **:[[slot=description]]:hidden",
									"has-data-[slot=avatar]:grid has-data-[slot=avatar]:grid-cols-[1fr_auto] has-data-[slot=avatar]:items-center has-data-[slot=avatar]:gap-x-2",
									"has-[svg]:grid has-[svg]:grid-cols-[1fr_auto] has-[svg]:items-center has-[svg]:gap-x-2",
									"*:[svg]:block-5 *:[svg]:inline-5 sm:*:[svg]:block-4 sm:*:[svg]:inline-4",
									"*:mbs-0 *:data-[slot=avatar]:[--avatar-size:--spacing(5)] sm:*:data-[slot=avatar]:[--avatar-size:--spacing(4.5)]",
								])}
							/>
							<ChevronsUpDownIcon
								data-slot="chevron"
								className="ms-auto -me-1 shrink-0 text-muted-fg block-5 inline-5 sm:block-4 sm:inline-4"
							/>
						</>
					)}
				</>
			)}
		</Button>
	</span>
);

const SelectSection = DropdownSection;
const SelectSeparator = DropdownSeparator;
const SelectLabel = DropdownLabel;
const SelectDescription = DropdownDescription;
const SelectItem = DropdownItem;

export type { SelectProps, SelectTriggerProps };
export {
	Select,
	SelectContent,
	SelectDescription,
	SelectItem,
	SelectLabel,
	SelectSection,
	SelectSeparator,
	SelectTrigger,
};
