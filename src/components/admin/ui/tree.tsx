import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "react-aria-components/Button";
import {
	TreeItemContent,
	type TreeItemContentProps,
	type TreeItemContentRenderProps,
	TreeItem as TreeItemPrimitive,
	type TreeItemProps,
	Tree as TreePrimitive,
	type TreeProps,
} from "react-aria-components/Tree";
import { twJoin, twMerge } from "tailwind-merge";

import { Checkbox, CheckboxField } from "#/src/components/admin/ui/checkbox.tsx";
import { cx } from "#/src/components/admin/ui/primitive.ts";

const TreeIndicator = ({
	values,
}: {
	values: Pick<TreeItemContentRenderProps, "isDisabled" | "isExpanded">;
}): ReactNode => (
	<Button
		slot="chevron"
		isDisabled={values.isDisabled}
		className={twJoin("shrink-0 content-center text-muted-fg hover:text-fg", values.isExpanded && "text-fg")}
	>
		<ChevronRightIcon
			data-slot="chevron"
			className={twJoin(
				"transition-transform duration-200 ease-in-out block-5 inline-5 sm:block-4 sm:inline-4",
				values.isExpanded && "rotate-90",
			)}
		/>
	</Button>
);

const Tree = <T extends object>({ className, ...props }: TreeProps<T>): ReactNode => (
	<TreePrimitive
		className={cx(
			twJoin(
				"flex cursor-default flex-col gap-y-2 overflow-auto outline-hidden forced-color-adjust-none",
				"[--tree-active-bg:var(--color-primary-subtle)] [--tree-active-fg:var(--color-primary-subtle-fg)]",
			),
			className,
		)}
		{...props}
	/>
);

const TreeItem = <T extends object>({ className, ...props }: TreeItemProps<T>): ReactNode => (
	<TreeItemPrimitive
		className={cx(
			[
				"shrink-0 rounded-lg px-2 py-1.5 pe-2",
				"group/tree-item relative flex rounded-lg select-none focus:outline-hidden",
				"focus:bg-(--tree-active-bg) focus:text-(--tree-active-fg) focus:**:[.text-muted-fg]:text-(--tree-active-fg)",
				"**:data-[slot=avatar]:block-6 **:data-[slot=avatar]:inline-6 **:data-[slot=avatar]:*:block-6 **:data-[slot=avatar]:*:inline-6 sm:**:data-[slot=avatar]:block-5 sm:**:data-[slot=avatar]:inline-5 sm:**:data-[slot=avatar]:*:block-5 sm:**:data-[slot=avatar]:*:inline-5",
				"**:[svg]:shrink-0 **:[svg]:block-5 **:[svg]:inline-5 sm:**:[svg]:block-4 sm:**:[svg]:inline-4",
				"**:[svg:not([data-slot=check-indicator]):not([data-slot=chevron])]:me-1",
				"disabled:opacity-50",
				"href" in props ? "cursor-pointer" : "cursor-default",
			],
			className,
		)}
		{...props}
	/>
);

interface TreeContentProps extends TreeItemContentProps {
	className?: string;
}

const TreeContent = ({ className, children, ...props }: TreeContentProps): ReactNode => (
	<TreeItemContent {...props}>
		{(values) => (
			<div
				className={twMerge("relative flex items-center gap-x-1 truncate text-sm/6 inline-full min-inline-0", className)}
			>
				{values.allowsDragging === true && <Button className="sr-only" slot="drag" />}
				{values.selectionMode === "multiple" && values.selectionBehavior === "toggle" && (
					<CheckboxField className="gap-x-0" slot="selection">
						<Checkbox className="col-span-1" />
					</CheckboxField>
				)}
				<div
					className={twJoin(
						"relative shrink-0 inline-[calc(calc(var(--tree-item-level)-1)*(--spacing(5)))]",
						"before:absolute before:inset-0 before:-ms-1 before:bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(var(--tree-item-level)-1px),var(--border)_calc(var(--tree-item-level)-1px),var(--border)_calc(var(--tree-item-level)))]",
					)}
				/>
				{values.hasChildItems ? (
					<TreeIndicator
						values={{
							isDisabled: values.isDisabled,
							isExpanded: values.isExpanded,
						}}
					/>
				) : (
					<span aria-hidden className="block shrink-0 inline-5" />
				)}
				{typeof children === "function" ? children(values) : children}
			</div>
		)}
	</TreeItemContent>
);

export type { TreeItemProps, TreeProps };
export { Tree, TreeContent, TreeIndicator, TreeItem };
