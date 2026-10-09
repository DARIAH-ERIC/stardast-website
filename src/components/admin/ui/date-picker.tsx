import type { DateDuration } from "@internationalized/date";
import { CalendarDaysIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "react-aria-components/Button";
import type { DateValue } from "react-aria-components/DateField";
import {
	DatePicker as DatePickerPrimitive,
	type DatePickerProps as DatePickerPrimitiveProps,
} from "react-aria-components/DatePicker";
import type { GroupProps } from "react-aria-components/Group";
import type { PopoverProps } from "react-aria-components/Popover";
import { twJoin } from "tailwind-merge";

import { Calendar } from "#/src/components/admin/ui/calendar.tsx";
import { DateInput } from "#/src/components/admin/ui/date-field.tsx";
import { fieldStyles } from "#/src/components/admin/ui/field.tsx";
import { InputGroup } from "#/src/components/admin/ui/input.tsx";
import { ModalContent } from "#/src/components/admin/ui/modal.tsx";
import { PopoverContent } from "#/src/components/admin/ui/popover.tsx";
import { cx } from "#/src/components/admin/ui/primitive.ts";
import { RangeCalendar } from "#/src/components/admin/ui/range-calendar.tsx";
import { useIsMobile } from "#/src/components/admin/ui/use-mobile.ts";

export interface DatePickerProps<T extends DateValue> extends DatePickerPrimitiveProps<T> {
	popover?: Omit<PopoverProps, "children">;
}

export function DatePicker<T extends DateValue>({
	className,
	children,
	popover,
	...props
}: DatePickerProps<T>): ReactNode {
	return (
		<DatePickerPrimitive data-slot="control" className={cx(fieldStyles({ className: "group" }), className)} {...props}>
			{(values) => (
				<>
					{typeof children === "function" ? children(values) : children}
					<DatePickerOverlay {...popover} />
				</>
			)}
		</DatePickerPrimitive>
	);
}

export interface DatePickerOverlayProps extends Omit<PopoverProps, "children"> {
	range?: boolean;
	visibleDuration?: DateDuration;
	pageBehavior?: "visible" | "single";
}

export function DatePickerOverlay({
	visibleDuration = { months: 1 },
	pageBehavior = "visible",
	placement = "bottom",
	range,
	...props
}: DatePickerOverlayProps): ReactNode {
	const isMobile = useIsMobile();

	return isMobile ? (
		<ModalContent closeButton={false}>
			<div className="flex justify-center p-6">
				{range === true ? (
					<RangeCalendar pageBehavior={pageBehavior} visibleDuration={visibleDuration} />
				) : (
					<Calendar />
				)}
			</div>
		</ModalContent>
	) : (
		<PopoverContent
			placement={placement}
			arrow={false}
			className={twJoin(
				"flex snap-x justify-center p-4 max-inline-none min-inline-auto sm:p-2 sm:pbs-3 sm:min-inline-66",
				visibleDuration.months === 1 ? "sm:max-inline-2xs" : "sm:max-inline-none",
			)}
			{...props}
		>
			{range === true ? <RangeCalendar pageBehavior={pageBehavior} visibleDuration={visibleDuration} /> : <Calendar />}
		</PopoverContent>
	);
}

export function DatePickerTrigger({ className, ...props }: GroupProps): ReactNode {
	return (
		<InputGroup className={cx("*:data-[slot=control]:inline-full", className)} {...props}>
			<DateInput />
			<Button
				data-slot="date-picker-trigger"
				className={twJoin(
					"touch-target grid place-content-center outline-hidden",
					"text-muted-fg hover:text-fg focus-visible:text-fg pressed:text-fg",
					"px-[calc(--spacing(3.5)-1px)] py-[calc(--spacing(2.5)-1px)] sm:px-[calc(--spacing(3)-1px)] sm:py-[calc(--spacing(1.5)-1px)]",
					"*:block-5 *:inline-5 sm:*:block-4 sm:*:inline-4",
				)}
			>
				<CalendarDaysIcon />
			</Button>
		</InputGroup>
	);
}
