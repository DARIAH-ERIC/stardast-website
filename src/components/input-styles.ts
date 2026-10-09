import { tv } from "tailwind-variants";

/**
 * Text inputs on the public site, square and as tall as the buttons beside them - see `buttonStyles`. 16px: ios zooms
 * into inputs with smaller text when they are focused. The field colours stay the same on brand-coloured bands.
 */
export const inputStyles = tv({
	base: "border border-field-border bg-field px-4 py-2.5 text-base text-field-foreground min-block-12 placeholder:text-field-placeholder focus:border-border-focus",
});
