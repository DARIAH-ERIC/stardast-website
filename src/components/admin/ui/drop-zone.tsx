import type { ReactNode } from "react";
import { composeRenderProps } from "react-aria-components/composeRenderProps";
import { DropZone as DropPrimitiveZone, type DropZoneProps } from "react-aria-components/DropZone";
import { twMerge } from "tailwind-merge";

export function DropZone({ className, ...props }: DropZoneProps): ReactNode {
	return (
		<DropPrimitiveZone
			className={composeRenderProps(className, (className, { isDropTarget }) =>
				twMerge(
					"group/drop-zone relative z-10 flex items-center justify-center overflow-hidden rounded-lg border border-dashed p-6 max-block-56",
					isDropTarget && "border-solid border-primary bg-primary/10 ring-3 ring-ring/20",
					className,
				),
			)}
			{...props}
		/>
	);
}
