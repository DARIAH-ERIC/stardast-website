import type { ReactNode } from "react";
import { Separator as Divider, type SeparatorProps } from "react-aria-components/Separator";
import { twMerge } from "tailwind-merge";

export function Separator({ orientation = "horizontal", className, ...props }: SeparatorProps): ReactNode {
	return (
		<Divider
			orientation={orientation}
			className={twMerge(
				"shrink-0 border-0 bg-border forced-colors:bg-[ButtonBorder]",
				orientation === "horizontal" ? "block-px inline-full" : "block-full inline-px",
				className,
			)}
			{...props}
		/>
	);
}
