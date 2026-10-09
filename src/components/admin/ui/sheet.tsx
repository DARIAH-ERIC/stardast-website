import type { ReactNode } from "react";
import { useLocale } from "react-aria-components/I18nProvider";
import {
	SheetBackdrop,
	SheetContent as SheetContentPrimitive,
	type SheetContentProps as SheetContentPrimitiveProps,
	SheetOverlay,
	type SheetOverlayProps,
	Sheet as SheetPrimitive,
	SheetTrigger as SheetTriggerPrimitive,
} from "react-aria-components/Sheet";

import {
	DialogBody,
	DialogClose,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/src/components/admin/ui/dialog.tsx";
import { cx } from "#/src/components/admin/ui/primitive.ts";

const Sheet = SheetTriggerPrimitive;

interface SheetContentProps
	extends Omit<SheetOverlayProps, "children" | "position">, Pick<SheetContentPrimitiveProps, "children"> {
	isFloat?: boolean;
	position?: SheetOverlayProps["position"];
	overlay?: Omit<SheetOverlayProps, "children" | "position">;
	overscrollPadding?: boolean;
}

const positionVariants = {
	top: "[--sheet-stack-y:8px] w-full max-w-[800px] rounded-b-4xl border-b data-[float=false]:border-x data-[float=true]:mx-2 data-[float=true]:mt-2 data-[float=true]:w-[calc(100%-1rem)] data-[float=true]:border-b-0",
	bottom:
		"[--sheet-stack-y:-8px] w-full max-w-[800px] rounded-t-4xl border-t data-[float=false]:border-x data-[float=true]:mx-2 data-[float=true]:mb-2 data-[float=true]:w-[calc(100%-1rem)] data-[float=true]:border-t-0",
	left: "[--sheet-stack-x:8px] h-dvh w-3/4 border-r sm:max-w-80 data-[float=true]:my-2 data-[float=true]:ml-2 data-[float=true]:h-[calc(100dvh-1rem)] data-[float=true]:border-r-0",
	right:
		"[--sheet-stack-x:-8px] h-dvh w-3/4 border-l sm:max-w-80 data-[float=true]:my-2 data-[float=true]:mr-2 data-[float=true]:h-[calc(100dvh-1rem)] data-[float=true]:border-l-0",
	center: "w-[calc(100%-2rem)] max-w-lg rounded-2xl border data-[float=true]:border-0",
};

const SheetContent = ({
	className,
	position = "bottom",
	isFloat = true,
	overlay,
	children,
	snapPoints,
	preventDismissal,
	...props
}: SheetContentProps): ReactNode => {
	const { direction } = useLocale();
	const resolvedPosition =
		position === "start"
			? direction === "rtl"
				? "right"
				: "left"
			: position === "end"
				? direction === "rtl"
					? "left"
					: "right"
				: position;
	return (
		<SheetOverlay
			{...props}
			{...overlay}
			snapPoints={snapPoints}
			position={position}
			preventDismissal={preventDismissal}
			className={cx("z-50", overlay?.className)}
		>
			<SheetBackdrop
				swipeAnimation="sheet-backdrop"
				className="data-[stack-index='0']:bg-black/15"
				swipeAnimationRange={snapPoints ? { start: snapPoints.length - 1 } : undefined}
			/>
			<SheetPrimitive
				overscrollPadding={isFloat ? false : (props.overscrollPadding ?? true)}
				stackAnimation="sheet-scale-back"
				data-float={isFloat}
				className={cx(
					"relative box-content shrink-0 origin-top border-fg/20 bg-overlay text-overlay-fg shadow-lg transition-transform [--sheet-gap:0px] motion-reduce:transition-none dark:border-border data-[float=true]:[--sheet-gap:16px]",
					"not-supports-[animation-timeline:view()]:data-has-descendants:transform-[translate(var(--sheet-stack-x,0px),var(--sheet-stack-y,0px))_scale(0.95)]",
					"dark:data-[float=true]:ring-border data-[float=true]:rounded-lg data-[float=true]:ring data-[float=true]:ring-fg/5",
					positionVariants[resolvedPosition],
					className,
				)}
			>
				{preventDismissal !== true && position === "bottom" && (
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-s-1/2 inset-bs-2 -translate-x-1/2 rounded-full bg-fg/30 block-1 inline-10"
					/>
				)}
				<SheetContentPrimitive
					data-slot="dialog"
					className="peer/dialog group/dialog relative flex flex-col overflow-hidden outline-hidden [--gutter:--spacing(6)] max-block-[calc(var(--visual-viewport-height)-var(--sheet-gap))]"
				>
					{children}
				</SheetContentPrimitive>
			</SheetPrimitive>
		</SheetOverlay>
	);
};

const SheetTrigger = DialogTrigger;
const SheetFooter = DialogFooter;
const SheetHeader = DialogHeader;
const SheetTitle = DialogTitle;
const SheetDescription = DialogDescription;
const SheetBody = DialogBody;
const SheetClose = DialogClose;

export type { SheetContentProps };
export {
	Sheet,
	SheetBody,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
};
