import type { ReactNode } from "react";
import { Group, type GroupProps } from "react-aria-components/Group";
import { Input as InputPrimitive, type InputProps as InputPrimitiveProps } from "react-aria-components/Input";

import { cx } from "#/src/components/admin/ui/primitive.ts";

interface InputProps extends InputPrimitiveProps {
	ref?: React.RefObject<HTMLInputElement | null>;
}
export function Input({ className, ref, ...props }: InputProps): ReactNode {
	return (
		<span data-slot="control" className="relative block inline-full">
			<InputPrimitive
				className={cx(
					"relative block appearance-none rounded-lg bg-(--control-bg,transparent) px-[calc(--spacing(3.5)-1px)] py-[calc(--spacing(2.5)-1px)] inline-full sm:px-[calc(--spacing(3)-1px)] sm:py-[calc(--spacing(1.5)-1px)]",
					"text-base/6 text-fg placeholder:text-muted-fg sm:text-sm/6",
					"border border-input enabled:hover:border-muted-fg/30",
					"outline-hidden focus:border-ring/70 focus:ring-3 focus:ring-ring/20 focus:enabled:hover:border-ring/80",
					"invalid:border-danger-subtle-fg/70 invalid:enabled:hover:border-danger-subtle-fg/80 focus:invalid:border-danger-subtle-fg/70 focus:invalid:ring-danger-subtle-fg/20 focus:invalid:enabled:hover:border-danger-subtle-fg/80",
					"[&::-ms-reveal]:hidden [&::-webkit-search-cancel-button]:hidden",
					"disabled:bg-muted forced-colors:in-disabled:text-[GrayText]",
					"in-disabled:bg-muted forced-colors:in-disabled:text-[GrayText]",
					"dark:scheme-dark",
					className,
				)}
				ref={ref}
				{...props}
			/>
		</span>
	);
}

export function InputGroup({ className, ...props }: GroupProps): ReactNode {
	return (
		<Group
			data-slot="control"
			className={cx(
				"relative isolate block",
				// icon
				"sm:has-[>[data-slot=icon]:first-child]:[&_input]:ps-8 sm:has-[>[data-slot=icon]:last-child]:[&_input]:pe-8 has-[>[data-slot=icon]:first-child]:[&_input]:ps-10 has-[>[data-slot=icon]:last-child]:[&_input]:pe-10",
				"*:data-[slot=icon]:pointer-events-none *:data-[slot=icon]:absolute *:data-[slot=icon]:inset-bs-3 *:data-[slot=icon]:z-10 *:data-[slot=icon]:block-5 *:data-[slot=icon]:inline-5 sm:*:data-[slot=icon]:inset-bs-2.5 sm:*:data-[slot=icon]:block-4 sm:*:data-[slot=icon]:inline-4",
				"sm:[&>[data-slot=icon]:first-child]:inset-s-2.5 sm:[&>[data-slot=icon]:last-child]:inset-e-2.5 [&>[data-slot=icon]:first-child]:inset-s-3 [&>[data-slot=icon]:last-child]:inset-e-3",

				// loader
				"sm:has-[[data-slot=loader]:first-child]:[&_input]:ps-8 sm:has-[[data-slot=loader]:last-child]:[&_input]:pe-8 has-[[data-slot=loader]:first-child]:[&_input]:ps-10 has-[[data-slot=loader]:last-child]:[&_input]:pe-10",
				"*:data-[slot=loader]:pointer-events-none *:data-[slot=loader]:absolute *:data-[slot=loader]:inset-bs-3 *:data-[slot=loader]:z-10 *:data-[slot=loader]:block-5 *:data-[slot=loader]:inline-5 sm:*:data-[slot=loader]:inset-bs-2.5 sm:*:data-[slot=loader]:block-4 sm:*:data-[slot=loader]:inline-4",
				"sm:[&>[data-slot=loader]:first-child]:inset-s-2.5 sm:[&>[data-slot=loader]:last-child]:inset-e-2.5 [&>[data-slot=loader]:first-child]:inset-s-3 [&>[data-slot=loader]:last-child]:inset-e-3",

				// text
				"sm:has-[[data-slot=text]:first-child]:[&_input]:ps-(--input-gutter-start,--spacing(10)) sm:has-[[data-slot=text]:last-child]:[&_input]:pe-(--input-gutter-end,--spacing(10)) has-[[data-slot=text]:first-child]:[&_input]:ps-[calc(var(--input-gutter-start)+(--spacing(2)))] has-[[data-slot=text]:last-child]:[&_input]:pe-[calc(var(--input-gutter-end)+(--spacing(2)))]",
				"*:data-[slot=text]:absolute *:data-[slot=text]:inset-bs-0 *:data-[slot=text]:z-10 *:data-[slot=text]:grow *:data-[slot=text]:content-center *:data-[slot=text]:block-full *:data-[slot=text]:max-inline-fit [&>[data-slot='text']:not([class*='pointer-events'])]:pointer-events-none",
				"sm:[&>[data-slot=text]:first-child:not([class*='start-'])]:inset-s-2.5 sm:[&>[data-slot=text]:last-child:not([class*='end-'])]:inset-e-2.5 [&>[data-slot=text]:first-child:not([class*='start-'])]:inset-s-3 [&>[data-slot=text]:last-child:not([class*='end-'])]:inset-e-3",

				// keyboard
				"sm:has-[[data-slot=keyboard]:first-child]:[&_input]:ps-(--input-gutter-start,--spacing(10)) sm:has-[[data-slot=keyboard]:last-child]:[&_input]:pe-(--input-gutter-end,--spacing(10)) has-[[data-slot=keyboard]:first-child]:[&_input]:ps-[calc(var(--input-gutter-start)+(--spacing(2)))] has-[[data-slot=keyboard]:last-child]:[&_input]:pe-[calc(var(--input-gutter-end)+(--spacing(2)))]",
				"*:data-[slot=keyboard]:absolute *:data-[slot=keyboard]:inset-bs-0 *:data-[slot=keyboard]:z-10 *:data-[slot=keyboard]:grow *:data-[slot=keyboard]:content-center *:data-[slot=keyboard]:block-full *:data-[slot=keyboard]:max-inline-fit [&>[data-slot='keyboard']:not([class*='pointer-events'])]:pointer-events-none",
				"sm:[&>[data-slot=keyboard]:first-child:not([class*='start-'])]:inset-s-2.5 sm:[&>[data-slot=keyboard]:last-child:not([class*='end-'])]:inset-e-2.5 [&>[data-slot=keyboard]:first-child:not([class*='start-'])]:inset-s-3 [&>[data-slot=keyboard]:last-child:not([class*='end-'])]:inset-e-3",

				// button
				"sm:has-[>button:first-child]:[&_input]:ps-(--input-gutter-start,--spacing(14)) sm:has-[>button:last-child]:[&_input]:pe-(--input-gutter-end,--spacing(14)) has-[>button:first-child]:[&_input]:ps-(--input-gutter-start,--spacing(16)) has-[>button:last-child]:[&_input]:pe-(--input-gutter-end,--spacing(16))",
				"[&>button:first-child]:rounded-e-none [&>button:last-child]:rounded-s-none",
				"*:[button]:absolute *:[button]:inset-bs-0 *:[button]:z-10 *:[button]:min-block-11 sm:*:[button]:min-block-9 [&>button[data-intent=outline]]:border-input",
				"[&>button:first-child]:inset-s-0 [&>button:last-child]:inset-e-0",

				"[&>[data-slot='icon']:not([class*='text-'])]:text-muted-fg [&>[data-slot='loader']:not([class*='text-'])]:text-muted-fg [&>[data-slot='text']:not([class*='text-'])]:text-muted-fg",
				className,
			)}
			{...props}
		/>
	);
}
