import { MinusIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button, type ButtonProps } from "react-aria-components/Button";
import type { InputProps as PrimitiveInputProps } from "react-aria-components/Input";
import { NumberField as NumberFieldPrimitive, type NumberFieldProps } from "react-aria-components/NumberField";

import { fieldStyles } from "#/src/components/admin/ui/field.tsx";
import { Input, InputGroup } from "#/src/components/admin/ui/input.tsx";
import { cx } from "#/src/components/admin/ui/primitive.ts";

const NumberField = ({ className, ...props }: NumberFieldProps): ReactNode => (
	<NumberFieldPrimitive {...props} data-slot="control" className={cx(fieldStyles(), className)} />
);

interface StepperButtonProps extends ButtonProps {
	slot: "increment" | "decrement";
	className?: string;
}

const StepperButton = ({ slot, className, ...props }: StepperButtonProps) => (
	<Button
		className={cx(
			"inline-grid place-content-center text-muted-fg enabled:hover:text-fg pressed:text-fg",
			"grow bg-input/20 block-full inline-full min-inline-11 sm:min-inline-8.5 pressed:bg-input/60",
			"*:data-[slot=stepper-icon]:block-5 *:data-[slot=stepper-icon]:inline-5 sm:*:data-[slot=stepper-icon]:block-4 sm:*:data-[slot=stepper-icon]:inline-4",
			"disabled:pointer-events-none disabled:opacity-50",
			className,
		)}
		slot={slot}
		{...props}
	>
		{slot === "increment" ? <PlusIcon data-slot="stepper-icon" /> : <MinusIcon data-slot="stepper-icon" />}
	</Button>
);

interface InputProps extends PrimitiveInputProps {
	ref?: React.RefObject<HTMLInputElement>;
}

function NumberInput({ className, ...props }: InputProps): ReactNode {
	return (
		<InputGroup className="[--input-gutter-end:--spacing(20)]">
			<Input className={cx("tabular-nums", className)} {...props} />
			<div
				data-slot="text"
				className="pointer-events-auto inset-e-0 p-px in-disabled:pointer-events-none in-disabled:opacity-50"
			>
				<div className="flex items-center divide-x overflow-hidden rounded-e-[calc(var(--radius-lg)-1px)] border-s block-full">
					<StepperButton slot="decrement" />
					<StepperButton slot="increment" />
				</div>
			</div>
		</InputGroup>
	);
}

export type { NumberFieldProps };
export { NumberField, NumberInput };
