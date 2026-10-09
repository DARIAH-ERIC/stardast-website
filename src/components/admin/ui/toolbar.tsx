import { type ReactNode, createContext, use } from "react";
import { composeRenderProps } from "react-aria-components/composeRenderProps";
import { Group, type GroupProps } from "react-aria-components/Group";
import type { SeparatorProps } from "react-aria-components/Separator";
import { Toolbar as ToolbarPrimitive, type ToolbarProps as ToolbarPrimitiveProps } from "react-aria-components/Toolbar";
import { twMerge } from "tailwind-merge";

import { cx } from "#/src/components/admin/ui/primitive.ts";
import { Separator } from "#/src/components/admin/ui/separator.tsx";
import { Toggle, type ToggleProps } from "#/src/components/admin/ui/toggle.tsx";

const ToolbarContext = createContext<ToolbarProps>({
	orientation: "horizontal",
	isCircle: false,
});

interface ToolbarProps extends ToolbarPrimitiveProps {
	isCircle?: boolean;
}

const Toolbar = ({ orientation = "horizontal", isCircle, className, ...props }: ToolbarProps): ReactNode => (
	<ToolbarContext value={{ orientation, isCircle }}>
		<ToolbarPrimitive
			orientation={orientation}
			{...props}
			className={composeRenderProps(className, (className, { orientation }) =>
				twMerge(
					"group inline-flex scrollbar-none flex-row gap-1.5 bg-overlay p-1.5 inset-ring inset-ring-border [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
					isCircle === true ? "rounded-full" : "rounded-lg",
					orientation === "horizontal"
						? "scrollbar-none flex-row items-center [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
						: "flex-col items-start",
					className,
				),
			)}
		/>
	</ToolbarContext>
);

const ToolbarGroupContext = createContext<{ isDisabled?: boolean; isCircle?: boolean }>({});

interface ToolbarGroupProps extends GroupProps {}
const ToolbarGroup = ({ isDisabled, className, ...props }: ToolbarGroupProps): ReactNode => (
	<ToolbarGroupContext value={{ isDisabled }}>
		<Group
			className={cx(
				"flex gap-1.5 group-orientation-horizontal:items-center group-orientation-vertical:flex-col group-orientation-vertical:items-start",
				className,
			)}
			{...props}
		>
			{props.children}
		</Group>
	</ToolbarGroupContext>
);

interface ToggleItemProps extends ToggleProps {}

const ToolbarItem = ({
	isDisabled,
	isCircle,
	size = "sm",
	intent = "outline",
	ref,
	className,
	...props
}: ToggleItemProps): ReactNode => {
	const context = use(ToolbarGroupContext);
	const { isCircle: contextCircle } = use(ToolbarContext);
	const effectiveIsDisabled = isDisabled === true || context.isDisabled === true;
	const effectiveIsCircle = isCircle === true || contextCircle === true;
	return (
		<Toggle
			intent={intent}
			size={size}
			ref={ref}
			data-slot="toolbar-item"
			className={cx(effectiveIsCircle ? "rounded-full" : "rounded-[calc(var(--radius-lg)-1px)]", className)}
			isDisabled={effectiveIsDisabled}
			{...props}
		/>
	);
};
type ToolbarSeparatorProps = SeparatorProps;
const ToolbarSeparator = ({ className, ...props }: ToolbarSeparatorProps): ReactNode => {
	const { orientation } = use(ToolbarContext);
	const reverseOrientation = orientation === "vertical" ? "horizontal" : "vertical";
	return (
		<Separator
			orientation={reverseOrientation}
			className={twMerge(reverseOrientation === "vertical" ? "mx-0.5 block-6" : "my-0.5 inline-8", className)}
			{...props}
		/>
	);
};

export type { ToggleItemProps, ToolbarGroupProps, ToolbarProps, ToolbarSeparatorProps };
export { Toolbar, ToolbarGroup, ToolbarItem, ToolbarSeparator };
