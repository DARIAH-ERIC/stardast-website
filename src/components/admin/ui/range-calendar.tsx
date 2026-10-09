import type { ReactNode } from "react";
import { CalendarCell, CalendarGrid, CalendarGridBody } from "react-aria-components/Calendar";
import type { DateValue } from "react-aria-components/DateField";
import { RangeCalendar as RangeCalendarPrimitive, type RangeCalendarProps } from "react-aria-components/RangeCalendar";
import { twJoin, twMerge } from "tailwind-merge";

import { CalendarGridHeader, CalendarHeader } from "#/src/components/admin/ui/calendar.tsx";

export function RangeCalendar<T extends DateValue>({
	visibleDuration = { months: 1 },
	...props
}: RangeCalendarProps<T>): ReactNode {
	return (
		<RangeCalendarPrimitive data-slot="calendar" visibleDuration={visibleDuration} {...props}>
			<CalendarHeader />
			<div className="flex snap-x items-start justify-stretch gap-6 overflow-auto sm:gap-10">
				{Array.from({ length: visibleDuration.months ?? 1 }).map((_, index) => {
					const id = index + 1;
					return (
						<CalendarGrid
							key={index}
							offset={id >= 2 ? { months: id - 1 } : undefined}
							className="[&_td]:border-collapse [&_td]:px-0 [&_td]:py-0.5"
						>
							<CalendarGridHeader />
							<CalendarGridBody className="snap-start">
								{(date) => (
									<CalendarCell
										date={date}
										className={({ isToday }) =>
											twJoin(
												"shrink-0 [--cell-fg:var(--color-primary-subtle-fg)] [--cell:var(--color-primary-subtle)]",
												"group/calendar-cell relative cursor-default leading-[2.286rem] outline-hidden block-11 inline-11 sm:text-sm sm:block-9 sm:inline-9 outside-month:text-muted-fg selection-start:rounded-s-lg selection-end:rounded-e-lg",
												"selected:bg-(--cell) selected:text-(--cell-fg)",
												"focus-visible:after:bg-primary-fg selected:after:bg-primary-fg",
												"invalid:selected:bg-danger-subtle",
												"[td:first-child_&]:rounded-s-lg [td:last-child_&]:rounded-e-lg",
												"forced-colors:selected:bg-[Highlight] forced-colors:selected:text-[HighlightText] forced-colors:invalid:selected:bg-[Mark]",
												isToday &&
													"after:pointer-events-none after:absolute after:inset-s-1/2 after:inset-be-1 after:z-10 after:-translate-x-1/2 after:rounded-full after:bg-primary after:block-0.75 after:inline-0.75 selected:after:bg-primary-fg",
											)
										}
									>
										{({ formattedDate, isSelected, isSelectionStart, isSelectionEnd, isDisabled }) => (
											<span
												className={twMerge(
													"flex items-center justify-center rounded-lg tabular-nums forced-color-adjust-none block-full inline-full",
													isSelected && (isSelectionStart || isSelectionEnd)
														? "bg-primary text-primary-fg group-invalid/calendar-cell:bg-danger group-invalid/calendar-cell:text-danger-fg forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:group-invalid/calendar-cell:bg-[Mark]"
														: isSelected
															? [
																	// hover
																	"group-hover/calendar-cell:bg-primary/15",
																	// pressed
																	"group-pressed/calendar-cell:bg-(--cell)",
																	// invalid
																	"group-invalid/calendar-cell:text-danger-subtle-fg group-invalid/calendar-cell:group-hover/calendar-cell:bg-danger/15 group-invalid/calendar-cell:group-pressed/calendar-cell:bg-danger/30",
																	// forced-colors
																	"forced-colors:text-[HighlightText] forced-colors:group-hover/calendar-cell:bg-[Highlight] forced-colors:group-invalid:group-hover/calendar-cell:bg-[Mark] forced-colors:group-pressed/calendar-cell:bg-[Highlight] forced-colors:group-invalid/calendar-cell:group-pressed/calendar-cell:bg-[Mark]",
																]
															: "group-hover/calendar-cell:bg-secondary-fg/15 group-pressed/calendar-cell:bg-secondary-fg/20 forced-colors:group-pressed/calendar-cell:bg-[Highlight]",
													isDisabled && "opacity-50 forced-colors:text-[GrayText]",
												)}
											>
												{formattedDate}
											</span>
										)}
									</CalendarCell>
								)}
							</CalendarGridBody>
						</CalendarGrid>
					);
				})}
			</div>
		</RangeCalendarPrimitive>
	);
}
