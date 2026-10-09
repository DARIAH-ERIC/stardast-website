import { tv } from "tailwind-variants";

/**
 * Call to action links, and buttons which look like them, on the public site - the admin ui has its own. Square, with a
 * monospace uppercase label. On brand-coloured bands, the colours invert by themselves, see `scheme-brand`.
 */
export const buttonStyles = tv({
	base: "inline-flex items-center gap-2.5 border px-5 py-3 font-mono text-[0.8125rem]/4 font-medium tracking-wider uppercase transition-colors min-block-12",
	variants: {
		variant: {
			primary: "border-transparent bg-primary text-primary-foreground hover:bg-primary-hover",
			secondary: "border-foreground-strong text-foreground-strong hover:bg-foreground-strong hover:text-background",
		},
	},
	defaultVariants: {
		variant: "primary",
	},
});

export type ButtonVariant = keyof typeof buttonStyles.variants.variant;
