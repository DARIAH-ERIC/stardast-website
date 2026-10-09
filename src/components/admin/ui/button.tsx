import type { ReactNode } from "react";
import { Button as ButtonPrimitive, type ButtonProps as ButtonPrimitiveProps } from "react-aria-components/Button";
import { type VariantProps, tv } from "tailwind-variants";

import { cx } from "#/src/components/admin/ui/primitive.ts";

export const buttonStyles = tv({
	base: [
		"[--btn-border:var(--color-fg)]/15 [--btn-icon-active:var(--btn-fg)] [--btn-outline:var(--btn-bg)] [--btn-radius:calc(var(--radius-lg)-1px)] [--btn-ring:var(--btn-bg)]/20",
		"bg-(--btn-bg) text-(--btn-fg) ring-(--btn-ring) outline-(--btn-outline) hover:bg-(--btn-overlay)",
		"relative isolate inline-flex items-center justify-center border border-(--btn-border) font-medium hover:no-underline",
		"focus:outline-0 focus-visible:ring-2 focus-visible:ring-offset-3 focus-visible:ring-offset-bg focus-visible:outline focus-visible:outline-offset-2",
		"forced-colors:[--btn-icon:ButtonText] forced-colors:hover:[--btn-icon:ButtonText] *:[svg]:-mx-0.5 *:[svg]:shrink-0 *:[svg]:self-center *:[svg]:text-(--btn-icon) hover:*:[svg]:text-(--btn-icon-active)/90 focus-visible:*:[svg]:text-(--btn-icon-active)/80",
		"*:data-[slot=loader]:-mx-0.5 *:data-[slot=loader]:shrink-0 *:data-[slot=loader]:self-center *:data-[slot=loader]:text-(--btn-icon)",
		"disabled:opacity-50 disabled:forced-colors:text-[GrayText] pending:opacity-50",
		"*:data-[slot=color-swatch]:-mx-0.5 *:data-[slot=color-swatch]:shrink-0 *:data-[slot=color-swatch]:self-center *:data-[slot=color-swatch]:[--size:--spacing(5)]",
	],
	variants: {
		intent: {
			primary:
				"[--btn-bg:var(--color-primary)] [--btn-fg:var(--color-primary-fg)] [--btn-icon-active:var(--primary-fg)]/80 [--btn-icon:var(--primary-fg)]/60 [--btn-overlay:color-mix(in_oklab,var(--color-primary-fg)_10%,var(--color-primary)_90%)]",
			secondary:
				"[--btn-bg:var(--color-secondary)] [--btn-fg:var(--color-secondary-fg)] [--btn-icon:var(--color-muted-fg)] [--btn-outline:var(--color-secondary-fg)] [--btn-overlay:color-mix(in_oklab,var(--color-secondary-fg)_10%,var(--color-secondary)_90%)] [--btn-ring:var(--color-muted-fg)]/20",
			warning:
				"[--btn-bg:var(--color-warning)] [--btn-fg:var(--color-warning-fg)] [--btn-icon:var(--color-warning-fg)]/60 [--btn-overlay:color-mix(in_oklab,var(--color-white)_10%,var(--color-warning)_90%)]",
			danger:
				"[--btn-bg:var(--color-danger)] [--btn-fg:var(--color-danger-fg)] [--btn-icon:color-mix(in_oklab,var(--color-danger-fg)_60%,var(--danger)_40%)] [--btn-overlay:color-mix(in_oklab,var(--color-white)_10%,var(--color-danger)_90%)]",
			success:
				"[--btn-bg:var(--color-success)] [--btn-fg:var(--color-success-fg)] [--btn-icon:color-mix(in_oklab,var(--color-success-fg)_60%,var(--success)_40%)] [--btn-overlay:color-mix(in_oklab,var(--color-white)_10%,var(--color-success)_90%)]",
			outline:
				"border-border [--btn-bg:transparent] [--btn-icon:var(--color-muted-fg)] [--btn-outline:var(--color-ring)] [--btn-overlay:var(--color-secondary)] [--btn-ring:var(--color-ring)]/20",
			plain:
				"border-transparent [--btn-bg:transparent] [--btn-icon:var(--color-muted-fg)] [--btn-outline:var(--color-ring)] [--btn-overlay:var(--color-secondary)] [--btn-ring:var(--color-ring)]/20",
		},
		size: {
			xs: [
				"gap-x-1.5 px-[calc(--spacing(3)-1px)] py-[calc(--spacing(1.5)-1px)] text-sm min-block-8 sm:px-2 sm:py-[calc(--spacing(1.5)-1px)] sm:text-xs/4 sm:min-block-7",
				"*:[svg]:-mx-px *:[svg]:block-3.5 *:[svg]:inline-3.5 sm:*:[svg]:block-3 sm:*:[svg]:inline-3",
				"*:data-[slot=loader]:-mx-px *:data-[slot=loader]:block-3.5 *:data-[slot=loader]:inline-3.5 sm:*:data-[slot=loader]:block-3 sm:*:data-[slot=loader]:inline-3",
			],
			sm: [
				"gap-x-1.5 px-3 py-[calc(--spacing(2)-1px)] min-block-9 sm:px-[calc(--spacing(3)-1px)] sm:py-[calc(--spacing(1.5)-1px)] sm:text-sm/5 sm:min-block-8",
				"*:[svg]:block-4.5 *:[svg]:inline-4.5 sm:*:[svg]:block-4 sm:*:[svg]:inline-4",
				"*:data-[slot=loader]:block-4.5 *:data-[slot=loader]:inline-4.5 sm:*:data-[slot=loader]:block-4 sm:*:data-[slot=loader]:inline-4",
			],
			md: [
				"gap-x-2 px-[calc(--spacing(3.5)-1px)] py-[calc(--spacing(2.5)-1px)] min-block-10 sm:px-3 sm:py-[calc(--spacing(1.5)-1px)] sm:text-sm/6 sm:min-block-9",
				"*:[svg]:block-5 *:[svg]:inline-5 sm:*:[svg]:block-4 sm:*:[svg]:inline-4",
				"*:data-[slot=loader]:block-5 *:data-[slot=loader]:inline-5 sm:*:data-[slot=loader]:block-4 sm:*:data-[slot=loader]:inline-4",
			],
			lg: [
				"gap-x-2 px-[calc(--spacing(3.5)-1px)] py-[calc(--spacing(3)-1px)] min-block-10 sm:px-3 sm:py-[calc(--spacing(1.5)-1px)] sm:text-sm/7 sm:min-block-9",
				"*:[svg]:block-5 *:[svg]:inline-5 sm:*:[svg]:block-4.5 sm:*:[svg]:inline-4.5",
				"*:data-[slot=loader]:block-5 *:data-[slot=loader]:inline-5 sm:*:data-[slot=loader]:block-4.5 sm:*:data-[slot=loader]:inline-4.5",
			],
			"sq-xs": [
				"touch-target shrink-0 block-8 inline-8 sm:block-7 sm:inline-7",
				"*:[svg]:block-3.5 *:[svg]:inline-3.5 sm:*:[svg]:block-3 sm:*:[svg]:inline-3",
				"*:data-[slot=loader]:block-3.5 *:data-[slot=loader]:inline-3.5 sm:*:data-[slot=loader]:block-3 sm:*:data-[slot=loader]:inline-3",
			],
			"sq-sm": [
				"touch-target shrink-0 block-10 inline-10 sm:block-8 sm:inline-8",
				"*:[svg]:block-4.5 *:[svg]:inline-4.5 sm:*:[svg]:block-4 sm:*:[svg]:inline-4",
				"*:data-[slot=loader]:block-4.5 *:data-[slot=loader]:inline-4.5 sm:*:data-[slot=loader]:block-4 sm:*:data-[slot=loader]:inline-4",
			],
			"sq-md": [
				"touch-target shrink-0 block-11 inline-11 sm:block-9 sm:inline-9",
				"*:[svg]:block-5 *:[svg]:inline-5 sm:*:[svg]:block-4.5 sm:*:[svg]:inline-4.5",
				"*:data-[slot=loader]:block-5 *:data-[slot=loader]:inline-5 sm:*:data-[slot=loader]:block-4.5 sm:*:data-[slot=loader]:inline-4.5",
			],
			"sq-lg": [
				"touch-target shrink-0 block-12 inline-12 sm:block-10 sm:inline-10",
				"*:[svg]:block-6 *:[svg]:inline-6 sm:*:[svg]:block-5 sm:*:[svg]:inline-5",
				"*:data-[slot=loader]:block-6 *:data-[slot=loader]:inline-6 sm:*:data-[slot=loader]:block-5 sm:*:data-[slot=loader]:inline-5",
			],
		},

		isCircle: {
			true: "rounded-full",
			false: "rounded-lg",
		},
	},
	defaultVariants: {
		intent: "primary",
		size: "md",
		isCircle: false,
	},
});

export interface ButtonProps extends ButtonPrimitiveProps, VariantProps<typeof buttonStyles> {
	ref?: React.Ref<HTMLButtonElement>;
}

export function Button({ className, intent, size, isCircle, ref, ...props }: ButtonProps): ReactNode {
	return (
		<ButtonPrimitive
			ref={ref}
			{...props}
			className={cx(
				buttonStyles({
					intent,
					size,
					isCircle,
				}),
				className,
			)}
		/>
	);
}
