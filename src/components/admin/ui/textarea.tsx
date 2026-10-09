import type { ReactNode } from "react";
import { TextArea, type TextAreaProps as TextAreaPrimitiveProps } from "react-aria-components/TextArea";

import { cx } from "#/src/components/admin/ui/primitive.ts";

interface TextAreaProps extends TextAreaPrimitiveProps {
	ref?: React.Ref<HTMLTextAreaElement>;
}
export function Textarea({ className, ref, ...props }: TextAreaProps): ReactNode {
	return (
		<span data-slot="control" className="relative block inline-full">
			<TextArea
				{...props}
				ref={ref}
				className={cx(
					"relative block field-sizing-content appearance-none rounded-lg bg-(--control-bg,transparent) px-[calc(--spacing(3.5)-1px)] py-[calc(--spacing(2.5)-1px)] inline-full min-block-16 sm:px-[calc(--spacing(3)-1px)] sm:py-[calc(--spacing(1.5)-1px)]",
					"text-base/6 text-fg placeholder:text-muted-fg sm:text-sm/6",
					"border border-input enabled:hover:border-muted-fg/30",
					"outline-hidden focus:border-ring/70 focus:ring-3 focus:ring-ring/20 focus:enabled:hover:border-ring/80",
					"invalid:border-danger-subtle-fg/70 invalid:enabled:hover:border-danger-subtle-fg/80 invalid:focus:enabled:hover:border-danger-subtle-fg/80 focus:invalid:border-danger-subtle-fg/70 focus:invalid:ring-danger-subtle-fg/20",
					"disabled:bg-muted forced-colors:in-disabled:text-[GrayText]",
					"in-disabled:bg-muted forced-colors:in-disabled:text-[GrayText]",
					"dark:scheme-dark",
					className,
				)}
			/>
		</span>
	);
}
