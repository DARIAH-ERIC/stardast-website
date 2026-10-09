import { CameraIcon, FolderIcon, PaperclipIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
	FileTrigger as FileTriggerPrimitive,
	type FileTriggerProps as FileTriggerPrimitiveProps,
} from "react-aria-components/FileTrigger";
import type { VariantProps } from "tailwind-variants";

import { Button, type buttonStyles } from "#/src/components/admin/ui/button.tsx";
import { Loader } from "#/src/components/admin/ui/loader.tsx";

export interface FileTriggerProps extends FileTriggerPrimitiveProps, VariantProps<typeof buttonStyles> {
	isDisabled?: boolean;
	isPending?: boolean;
	ref?: React.RefObject<HTMLInputElement>;
	className?: string;
}

export function FileTrigger({
	intent = "outline",
	size = "md",
	isCircle = false,
	ref,
	className,
	...props
}: FileTriggerProps): ReactNode {
	return (
		<FileTriggerPrimitive ref={ref} {...props}>
			<Button className={className} isDisabled={props.isDisabled} intent={intent} size={size} isCircle={isCircle}>
				{props.isPending !== true ? (
					props.defaultCamera ? (
						<CameraIcon />
					) : props.acceptDirectory === true ? (
						<FolderIcon />
					) : (
						<PaperclipIcon />
					)
				) : (
					<Loader />
				)}
				{props.children ?? (
					<>
						{props.allowsMultiple === true
							? "Browse files"
							: props.acceptDirectory === true
								? "Browse"
								: "Browse a file"}
						...
					</>
				)}
			</Button>
		</FileTriggerPrimitive>
	);
}
