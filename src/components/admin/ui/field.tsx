import type { ReactNode } from "react";
import { FieldError as FieldErrorPrimitive, type FieldErrorProps } from "react-aria-components/FieldError";
import { LabelContext, Label as LabelPrimitive, type LabelProps } from "react-aria-components/Label";
import { Text, type TextProps } from "react-aria-components/Text";
import { twMerge } from "tailwind-merge";
import { tv } from "tailwind-variants";

import { cx } from "#/src/components/admin/ui/primitive.ts";

export const labelStyles = tv({
	base: [
		"text-base/6 text-fg select-none in-data-required:not-data-[slot='control-label']:after:ms-1.5 sm:text-sm/6",
		"in-data-required:not-data-[slot='control-label']:after:text-danger-subtle-fg in-data-required:not-data-[slot='control-label']:after:content-['*']",
		"group-disabled:opacity-50 in-disabled:pointer-events-none in-disabled:opacity-50",
	],
});

export const descriptionStyles = tv({
	base: "block text-sm/6 text-muted-fg group-disabled:opacity-50 in-disabled:opacity-50",
});

export const fieldErrorStyles = tv({
	base: "block text-sm/6 text-danger-subtle-fg group-disabled:opacity-50 in-disabled:opacity-50 forced-colors:text-[Mark]",
});

export const fieldStyles = tv({
	base: [
		"inline-full",
		"[&>[data-slot=control]+[data-slot=control]]:mbs-2",
		"[&>[data-slot=label]+[data-slot=control]]:mbs-2",
		"[&>[data-slot=label]+[slot='description']]:mbs-1",
		"[&>[slot=description]+[data-slot=control]]:mbs-2",
		"[&>[data-slot=control]+[slot=description]]:mbs-2",
		"[&>[data-slot=control]+[slot=errorMessage]]:mbs-2",
		"*:data-[slot=label]:font-medium",
		"disabled:opacity-50 in-disabled:opacity-50",
	],
});

export function Label({ className, htmlFor, slot, ...props }: LabelProps): ReactNode {
	const label = (
		<LabelPrimitive data-slot="label" htmlFor={htmlFor} slot={slot} {...props} className={labelStyles({ className })} />
	);

	if (htmlFor != null && htmlFor !== "" && slot === undefined) {
		return <LabelContext.Provider value={null}>{label}</LabelContext.Provider>;
	}

	return label;
}

export function Description({ className, ...props }: TextProps): ReactNode {
	return <Text {...props} slot="description" className={descriptionStyles({ className })} />;
}

export function Fieldset({ className, ...props }: React.ComponentProps<"fieldset">): ReactNode {
	return (
		<fieldset className={twMerge("*:data-[slot=text]:mbs-1 [&>*+[data-slot=control]]:mbs-6", className)} {...props} />
	);
}

export function FieldGroup({ className, ...props }: React.ComponentPropsWithoutRef<"div">): ReactNode {
	return <div data-slot="control" className={twMerge("space-y-6", className)} {...props} />;
}

export function FieldError({ className, ...props }: FieldErrorProps): ReactNode {
	return <FieldErrorPrimitive {...props} className={cx(fieldErrorStyles(), className)} />;
}

export function Legend({ className, ...props }: React.ComponentProps<"legend">): ReactNode {
	return (
		<legend
			data-slot="legend"
			{...props}
			className={twMerge("text-base/6 font-semibold data-disabled:opacity-50", className)}
		/>
	);
}
