import { CheckIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button, type ButtonProps } from "react-aria-components/Button";
import { Collection } from "react-aria-components/Collection";
import { composeRenderProps } from "react-aria-components/composeRenderProps";
import { Header } from "react-aria-components/Header";
import {
	MenuItem as MenuItemPrimitive,
	type MenuItemProps as MenuItemPrimitiveProps,
	Menu as MenuPrimitive,
	type MenuProps as MenuPrimitiveProps,
	MenuSection as MenuSectionPrimitive,
	type MenuSectionProps as MenuSectionPrimitiveProps,
	MenuTrigger as MenuTriggerPrimitive,
	type MenuTriggerProps as MenuTriggerPrimitiveProps,
	SubmenuTrigger as SubmenuTriggerPrimitive,
	type SubmenuTriggerProps,
} from "react-aria-components/Menu";
import { twMerge } from "tailwind-merge";
import { type VariantProps, tv } from "tailwind-variants";

import {
	DropdownDescription,
	DropdownKeyboard,
	DropdownLabel,
	DropdownSeparator,
	dropdownItemStyles,
	dropdownSectionStyles,
} from "#/src/components/admin/ui/dropdown.tsx";
import { PopoverContent, type PopoverContentProps } from "#/src/components/admin/ui/popover.tsx";
import { cx } from "#/src/components/admin/ui/primitive.ts";

const Menu = (props: MenuTriggerPrimitiveProps): ReactNode => <MenuTriggerPrimitive {...props} />;

const MenuSubMenu = ({ delay = 0, ...props }: SubmenuTriggerProps): ReactNode => (
	<SubmenuTriggerPrimitive {...props} delay={delay}>
		{props.children}
	</SubmenuTriggerPrimitive>
);

interface MenuTriggerProps extends ButtonProps {
	ref?: React.Ref<HTMLButtonElement>;
}

const MenuTrigger = ({ className, ref, ...props }: MenuTriggerProps): ReactNode => (
	<Button
		ref={ref}
		data-slot="menu-trigger"
		className={cx(
			"relative inline text-start outline-hidden focus-visible:ring-1 focus-visible:ring-primary",
			"*:data-[slot=chevron]:block-5 *:data-[slot=chevron]:inline-5 sm:*:data-[slot=chevron]:block-4 sm:*:data-[slot=chevron]:inline-4",
			className,
		)}
		{...props}
	/>
);

interface MenuContentProps<T> extends MenuPrimitiveProps<T>, Pick<PopoverContentProps, "placement"> {
	className?: string;
	popover?: Pick<
		PopoverContentProps,
		| "arrow"
		| "className"
		| "placement"
		| "offset"
		| "crossOffset"
		| "arrowBoundaryOffset"
		| "triggerRef"
		| "isOpen"
		| "onOpenChange"
		| "shouldFlip"
		| "isNonModal"
		| "trigger"
		| "getTargetRect"
	>;
}

const menuContentStyles = tv({
	base: "grid grid-cols-[auto_minmax(0,1fr)] gap-y-1 overflow-x-hidden overflow-y-auto overscroll-contain p-1 outline-hidden [clip-path:inset(0_0_0_0_round_calc(var(--radius-xl)-(--spacing(1))))] max-block-[inherit] [&>[data-slot=menu-section]+[data-slot=menu-section]:not([class*='mt-']):not([class*='my-'])]:mbs-3",
});

const MenuContent = <T extends object>({ className, placement, popover, ...props }: MenuContentProps<T>): ReactNode => (
	<PopoverContent
		className={cx("min-inline-32 *:data-[slot=popover-inner]:overflow-hidden", popover?.className)}
		placement={placement}
		{...popover}
	>
		<MenuPrimitive data-slot="menu-content" className={menuContentStyles({ className })} {...props} />
	</PopoverContent>
);

interface MenuItemProps extends MenuItemPrimitiveProps, VariantProps<typeof dropdownItemStyles> {}

const MenuItem = ({ className, intent, children, ...props }: MenuItemProps): ReactNode => {
	const textValue = props.textValue ?? (typeof children === "string" ? children : undefined);
	return (
		<MenuItemPrimitive
			data-slot="menu-item"
			className={composeRenderProps(className, (className, { hasSubmenu, ...renderProps }) =>
				dropdownItemStyles({
					...renderProps,
					intent,
					className: hasSubmenu
						? twMerge(
								intent === "danger" && "open:bg-danger-subtle open:text-danger-subtle-fg",
								intent === "warning" && "open:bg-warning-subtle open:text-warning-subtle-fg",
								intent === undefined &&
									"open:bg-accent open:text-accent-fg open:*:[.text-muted-fg]:text-accent-fg open:*:[svg]:text-accent-fg",
								className,
							)
						: className,
				}),
			)}
			textValue={textValue}
			{...props}
		>
			{(values) => (
				<>
					{values.isSelected && ["single", "multiple"].includes(values.selectionMode) && <CheckIcon />}

					{typeof children === "function" ? children(values) : children}

					{values.hasSubmenu && (
						<ChevronRightIcon
							data-slot="chevron"
							className="absolute inset-e-0 -translate-y-1/2 block-4 inline-4"
							style={{
								top: "calc(var(--spacing) * 3)",
							}}
						/>
					)}
				</>
			)}
		</MenuItemPrimitive>
	);
};

export interface MenuHeaderProps extends React.ComponentProps<typeof Header> {
	separator?: boolean;
}

const MenuHeader = ({ className, separator = false, ...props }: MenuHeaderProps): ReactNode => (
	<Header
		className={twMerge(
			"col-span-full px-2.5 py-2 text-base font-medium sm:text-sm",
			separator && "-mx-1 border-be sm:px-3 sm:pbe-2.5",
			className,
		)}
		{...props}
	/>
);

const { section, header } = dropdownSectionStyles();

interface MenuSectionProps<T> extends MenuSectionPrimitiveProps<T> {
	ref?: React.Ref<HTMLDivElement>;
	label?: string;
}

const MenuSection = <T extends object>({ className, children, ref, ...props }: MenuSectionProps<T>): ReactNode => (
	<MenuSectionPrimitive data-slot="menu-section" ref={ref} className={section({ className })} {...props}>
		{"label" in props && <Header className={header()}>{props.label}</Header>}
		<Collection items={props.items}>{children}</Collection>
	</MenuSectionPrimitive>
);

const MenuSeparator = DropdownSeparator;
const MenuShortcut = DropdownKeyboard;
const MenuLabel = DropdownLabel;
const MenuDescription = DropdownDescription;

export type { MenuContentProps, MenuItemProps, MenuSectionProps, MenuTriggerProps };
export {
	Menu,
	MenuContent,
	MenuDescription,
	MenuHeader,
	MenuItem,
	MenuLabel,
	MenuSection,
	MenuSeparator,
	MenuShortcut,
	MenuSubMenu,
	MenuTrigger,
	menuContentStyles,
};
