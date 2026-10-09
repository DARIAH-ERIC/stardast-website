import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
	CalendarCell,
	CalendarGrid,
	CalendarGridBody,
	CalendarGridHeader as CalendarGridHeaderPrimitive,
	CalendarHeaderCell,
	CalendarMonthPicker,
	Calendar as CalendarPrimitive,
	type CalendarProps as CalendarPrimitiveProps,
	CalendarYearPicker,
	type DateValue,
} from "react-aria-components/Calendar";
import { composeRenderProps } from "react-aria-components/composeRenderProps";
import { Heading } from "react-aria-components/Heading";
import { useLocale } from "react-aria-components/I18nProvider";
import { twMerge } from "tailwind-merge";

import { Button } from "#/src/components/admin/ui/button.tsx";
import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger } from "#/src/components/admin/ui/select.tsx";

const CalendarHeader = ({ className, ...props }: React.ComponentProps<"header">): ReactNode => {
	const { direction } = useLocale();
	return (
		<header
			data-slot="calendar-header"
			className={twMerge("flex justify-between gap-1.5 ps-1.5 pe-1 pbs-1 pbe-5 inline-full sm:pbe-4", className)}
			{...props}
		>
			<div className="flex items-center gap-1.5">
				<CalendarMonthPicker>
					{({ items, ...props }) => (
						<Select {...props}>
							<SelectTrigger />
							<SelectContent items={items}>
								{(item) => (
									<SelectItem textValue={item.formatted}>
										<SelectLabel>{item.formatted}</SelectLabel>
									</SelectItem>
								)}
							</SelectContent>
						</Select>
					)}
				</CalendarMonthPicker>
				<CalendarYearPicker>
					{({ items, ...props }) => (
						<Select {...props}>
							<SelectTrigger />
							<SelectContent items={items}>
								{(item) => (
									<SelectItem textValue={item.formatted}>
										<SelectLabel>{item.formatted}</SelectLabel>
									</SelectItem>
								)}
							</SelectContent>
						</Select>
					)}
				</CalendarYearPicker>
			</div>
			<Heading className="sr-only" />
			<div className="flex items-center gap-1">
				<Button
					size="sq-sm"
					className="block-8 inline-8 sm:block-7 sm:inline-7 **:[svg]:text-fg"
					isCircle
					intent="plain"
					slot="previous"
				>
					{direction === "rtl" ? <ChevronRightIcon /> : <ChevronLeftIcon />}
				</Button>
				<Button
					size="sq-sm"
					className="block-8 inline-8 sm:block-7 sm:inline-7 **:[svg]:text-fg"
					isCircle
					intent="plain"
					slot="next"
				>
					{direction === "rtl" ? <ChevronLeftIcon /> : <ChevronRightIcon />}
				</Button>
			</div>
		</header>
	);
};

const CalendarGridHeader = (): ReactNode => (
	<CalendarGridHeaderPrimitive>
		{(day) => (
			<CalendarHeaderCell className="pbe-2 text-center text-sm/6 font-semibold text-muted-fg sm:px-0 sm:py-0.5 lg:text-xs">
				{day}
			</CalendarHeaderCell>
		)}
	</CalendarGridHeaderPrimitive>
);

interface CalendarProps<T extends DateValue> extends CalendarPrimitiveProps<T> {
	className?: string;
}

const Calendar = <T extends DateValue>({ className, ...props }: CalendarProps<T>): ReactNode => (
	<CalendarPrimitive data-slot="calendar" {...props}>
		<CalendarHeader />
		<CalendarGrid>
			<CalendarGridHeader />
			<CalendarGridBody>
				{(date) => (
					<CalendarCell
						date={date}
						className={composeRenderProps(className, (className, { isSelected, isToday, isDisabled }) =>
							twMerge(
								"relative flex cursor-default items-center justify-center rounded-lg text-fg tabular-nums outline-hidden block-11 inline-11 hover:bg-secondary-fg/15 sm:text-sm/6 sm:block-9 sm:inline-9 forced-colors:text-[ButtonText] forced-colors:outline-0",
								isSelected &&
									"bg-primary text-primary-fg hover:bg-primary/90 data-invalid:bg-danger data-invalid:text-danger-fg forced-colors:bg-[Highlight] forced-colors:text-[Highlight] forced-colors:data-invalid:bg-[Mark] pressed:bg-primary",
								isDisabled && "text-muted-fg forced-colors:text-[GrayText]",
								isToday &&
									"after:pointer-events-none after:absolute after:inset-s-1/2 after:inset-be-1 after:z-10 after:-translate-x-1/2 after:rounded-full after:bg-primary after:block-0.75 after:inline-0.75 focus-visible:after:bg-primary-fg selected:after:bg-primary-fg",
								className,
							),
						)}
					/>
				)}
			</CalendarGridBody>
		</CalendarGrid>
	</CalendarPrimitive>
);

export type { CalendarProps };
export { Calendar, CalendarGridHeader, CalendarHeader };
