import type { ReactNode } from "react";
import { composeRenderProps } from "react-aria-components/composeRenderProps";
import { ToggleButton, type ToggleButtonProps } from "react-aria-components/ToggleButton";
import { twMerge } from "tailwind-merge";
import { type VariantProps, tv } from "tailwind-variants";

export const toggleStyles = tv({
	base: [
		"[--toggle-icon-active:var(--secondary-fg)] [--toggle-icon:color-mix(in_oklab,var(--secondary-fg)_50%,var(--secondary))]",
		"relative isolate inline-flex items-center justify-center border font-medium",
		"focus-visible:ring-2 focus-visible:ring-offset-3 focus-visible:ring-offset-bg focus-visible:outline focus-visible:outline-offset-2",
		"*:[svg]:-mx-0.5 *:[svg]:my-0.5 *:[svg]:shrink-0 *:[svg]:self-center *:[svg]:text-(--toggle-icon) sm:*:[svg]:my-1",
		"focus-visible:*:[svg]:text-(--toggle-icon-active)",
		"selected:*:[svg]:text-(--toggle-icon-active)",
		"hover:*:[svg]:text-(--toggle-icon-active)",
		"forced-colors:[--toggle-icon:ButtonText] forced-colors:hover:[--toggle-icon:ButtonText] *:[svg]:-mx-0.5 *:[svg]:shrink-0 *:[svg]:self-center *:[svg]:text-(--toggle-icon) hover:*:[svg]:text-(--toggle-icon-active)/90 focus-visible:*:[svg]:text-(--toggle-icon-active)/80 pressed:*:[svg]:text-(--toggle-icon-active)",
		"forced-colors:[--toggle-icon:ButtonText] forced-colors:hover:[--toggle-icon:ButtonText]",
	],
	variants: {
		intent: {
			outline: ["bg-transparent ring-secondary-fg/25 outline-secondary-fg hover:bg-secondary selected:bg-secondary"],
			plain: [
				"border-transparent bg-transparent ring-secondary-fg/25 outline-secondary-fg hover:bg-secondary selected:bg-secondary",
			],
		},
		size: {
			xs: [
				"gap-x-1.5 px-[calc(--spacing(3)-1px)] py-[calc(--spacing(1.5)-1px)] text-sm min-block-8 sm:px-2 sm:py-[calc(--spacing(1.5)-1px)] sm:text-xs/4 sm:min-block-7",
				"*:[svg]:-mx-px *:[svg]:block-3.5 *:[svg]:inline-3.5 sm:*:[svg]:block-3 sm:*:[svg]:inline-3",
			],
			sm: [
				"gap-x-1.5 px-3 py-[calc(--spacing(2)-1px)] min-block-9 sm:px-[calc(--spacing(3)-1px)] sm:py-[calc(--spacing(1.5)-1px)] sm:text-sm/5 sm:min-block-8",
				"*:[svg]:block-4.5 *:[svg]:inline-4.5 sm:*:[svg]:block-4 sm:*:[svg]:inline-4",
			],
			md: [
				"gap-x-2 px-[calc(--spacing(3.5)-1px)] py-[calc(--spacing(2.5)-1px)] min-block-10 sm:px-3 sm:py-[calc(--spacing(1.5)-1px)] sm:text-sm/6 sm:min-block-9",
				"*:[svg]:block-5 *:[svg]:inline-5 sm:*:[svg]:block-4 sm:*:[svg]:inline-4",
			],
			lg: [
				"gap-x-2 px-[calc(--spacing(3.5)-1px)] py-[calc(--spacing(3)-1px)] min-block-10 sm:px-3 sm:py-[calc(--spacing(1.5)-1px)] sm:text-sm/7 sm:min-block-9",
				"*:[svg]:block-5 *:[svg]:inline-5 sm:*:[svg]:block-4.5 sm:*:[svg]:inline-4.5",
			],
			"sq-xs": [
				"touch-target shrink-0 block-8 inline-8 sm:block-7 sm:inline-7",
				"*:[svg]:block-3.5 *:[svg]:inline-3.5 sm:*:[svg]:block-3 sm:*:[svg]:inline-3",
			],
			"sq-sm": [
				"touch-target shrink-0 block-10 inline-10 sm:block-8 sm:inline-8",
				"*:[svg]:block-4.5 *:[svg]:inline-4.5 sm:*:[svg]:block-4 sm:*:[svg]:inline-4",
			],
			"sq-md": [
				"touch-target shrink-0 block-11 inline-11 sm:block-9 sm:inline-9",
				"*:[svg]:block-5 *:[svg]:inline-5 sm:*:[svg]:block-4.5 sm:*:[svg]:inline-4.5",
			],
			"sq-lg": [
				"touch-target shrink-0 block-12 inline-12 sm:block-10 sm:inline-10",
				"*:[svg]:block-6 *:[svg]:inline-6 sm:*:[svg]:block-5 sm:*:[svg]:inline-5",
			],
		},
		isCircle: {
			true: "rounded-full",
			false: "rounded-[calc(var(--radius-lg)-1px)]",
		},
		isDisabled: {
			true: "border-0 opacity-50 forced-colors:text-[GrayText]",
		},
	},
	defaultVariants: {
		intent: "plain",
		size: "md",
		isCircle: false,
	},
});

export interface ToggleProps extends ToggleButtonProps, VariantProps<typeof toggleStyles> {
	ref?: React.Ref<HTMLButtonElement>;
}
export function Toggle({ className, size, intent, isCircle, ref, ...props }: ToggleProps): ReactNode {
	return (
		<ToggleButton
			ref={ref}
			className={composeRenderProps(className, (className, renderProps) =>
				twMerge(
					toggleStyles({
						...renderProps,
						isCircle,
						size,
						intent,
						className,
					}),
				),
			)}
			{...props}
		/>
	);
}
