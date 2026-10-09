import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button as PrimitiveButton } from "react-aria-components/Button";
import { Dialog as PrimitiveDialog } from "react-aria-components/Dialog";
import { Heading, type HeadingProps } from "react-aria-components/Heading";
import type { TextProps } from "react-aria-components/Text";
import { twMerge } from "tailwind-merge";

import { Button, type ButtonProps } from "#/src/components/admin/ui/button.tsx";
import { cx } from "#/src/components/admin/ui/primitive.ts";

const Dialog = ({ role = "dialog", className, ...props }: React.ComponentProps<typeof PrimitiveDialog>): ReactNode => (
	<PrimitiveDialog
		data-slot="dialog"
		role={role}
		className={twMerge(
			"peer/dialog group/dialog relative flex flex-col overflow-hidden outline-hidden [--gutter:--spacing(6)] max-block-[calc(var(--visual-viewport-height)-var(--visual-viewport-vertical-padding))] sm:[--gutter:--spacing(8)]",
			className,
		)}
		{...props}
	/>
);

const DialogTrigger = ({ className, ...props }: ButtonProps): ReactNode => (
	<PrimitiveButton className={cx("cursor-pointer", className)} {...props} />
);

interface DialogTitleProps extends HeadingProps {
	ref?: React.Ref<HTMLHeadingElement>;
}
const DialogTitle = ({ className, ref, ...props }: DialogTitleProps): ReactNode => (
	<Heading
		slot="title"
		ref={ref}
		className={twMerge("text-lg/6 font-semibold text-balance text-fg sm:text-base/6", className)}
		{...props}
	/>
);

interface DialogDescriptionProps extends TextProps {
	ref?: React.Ref<HTMLDivElement>;
}
const DialogDescription = ({ className, ref, ...props }: DialogDescriptionProps): ReactNode => (
	<p
		data-slot="description"
		className={twMerge("text-base/6 text-pretty text-muted-fg group-disabled:opacity-50 sm:text-sm/6", className)}
		ref={ref}
		{...props}
	/>
);

interface DialogHeaderProps extends Omit<React.ComponentProps<"div">, "title"> {
	title?: string;
	description?: string;
}

const DialogHeader = ({ className, ...props }: DialogHeaderProps): ReactNode => (
	<div
		data-slot="dialog-header"
		className={twMerge("relative space-y-1 p-(--gutter) pbe-[calc(var(--gutter)-(--spacing(3)))]", className)}
	>
		{props.title != null && props.title !== "" && <DialogTitle>{props.title}</DialogTitle>}
		{props.description != null && props.description !== "" && (
			<DialogDescription>{props.description}</DialogDescription>
		)}
		{(props.title == null || props.title === "") && typeof props.children === "string" ? (
			<DialogTitle>{props.children}</DialogTitle>
		) : (
			props.children
		)}
	</div>
);

interface DialogBodyProps extends React.ComponentProps<"div"> {}
const DialogBody = ({ className, ...props }: DialogBodyProps): ReactNode => (
	<div
		data-slot="dialog-body"
		className={twMerge(
			"isolate flex flex-1 flex-col overflow-auto px-(--gutter) py-1 min-block-0",
			"**:data-[slot=dialog-footer]:px-0 **:data-[slot=dialog-footer]:pbs-0",
			className,
		)}
		{...props}
	/>
);

interface DialogFooterProps extends React.ComponentProps<"div"> {}
const DialogFooter = ({ className, ...props }: DialogFooterProps): ReactNode => (
	<div
		data-slot="dialog-footer"
		className={twMerge(
			"isolate mbs-auto flex flex-col-reverse justify-end gap-3 p-(--gutter) pbs-[calc(var(--gutter)-(--spacing(2)))] sm:flex-row group-not-has-data-[slot=dialog-body]/dialog:pbs-0 group-not-has-data-[slot=dialog-body]/popover:pbs-0",
			className,
		)}
		{...props}
	/>
);

const DialogClose = ({ intent = "plain", ref, ...props }: ButtonProps): ReactNode => (
	<Button slot="close" ref={ref} intent={intent} {...props} />
);

interface CloseButtonIndicatorProps extends Omit<ButtonProps, "children"> {
	className?: string;
	isDismissable?: boolean | undefined;
}

const DialogCloseIcon = ({ className, ...props }: CloseButtonIndicatorProps): ReactNode =>
	props.isDismissable === true ? (
		<PrimitiveButton
			slot="close"
			className={cx(
				"absolute inset-e-1 inset-bs-1 z-50 grid place-content-center rounded-xl block-8 inline-8 hover:bg-secondary focus:bg-secondary focus:outline-hidden focus-visible:ring-1 focus-visible:ring-primary sm:inset-e-2 sm:inset-bs-2 sm:rounded-md sm:block-7 sm:inline-7",
				className,
			)}
		>
			<XIcon className="block-4 inline-4" />
		</PrimitiveButton>
	) : null;

export type {
	CloseButtonIndicatorProps,
	DialogBodyProps,
	DialogDescriptionProps,
	DialogFooterProps,
	DialogHeaderProps,
	DialogTitleProps,
};
export {
	Dialog,
	DialogBody,
	DialogClose,
	DialogCloseIcon,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
};
