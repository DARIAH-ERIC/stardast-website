import { CircleAlertIcon, CircleCheckIcon, InfoIcon } from "lucide-react";
import type { ReactNode } from "react";
import { twJoin, twMerge } from "tailwind-merge";

export interface NoteProps extends React.HtmlHTMLAttributes<HTMLDivElement> {
	intent?: "default" | "info" | "warning" | "danger" | "success";
	indicator?: boolean;
}

export function Note({ indicator = true, intent = "default", className, ...props }: NoteProps): ReactNode {
	const iconMap: Record<string, React.ElementType | null> = {
		info: InfoIcon,
		warning: CircleAlertIcon,
		danger: CircleAlertIcon,
		success: CircleCheckIcon,
		default: null,
	};

	const IconComponent = iconMap[intent] ?? null;

	return (
		<div
			data-slot="note"
			className={twMerge([
				"grid grid-cols-[auto_1fr] overflow-hidden rounded-lg border border-current/15 p-4 text-base/6 backdrop-blur-2xl inline-full sm:text-sm/6",
				"*:[a]:hover:underline **:[strong]:font-medium",
				intent === "default" && "bg-muted/50 text-secondary-fg",
				intent === "info" && "bg-info-subtle text-info-subtle-fg **:[.text-muted-fg]:text-info-subtle-fg/70",
				intent === "warning" &&
					"bg-warning-subtle text-warning-subtle-fg **:[.text-muted-fg]:text-warning-subtle-fg/80",
				intent === "danger" && "bg-danger-subtle text-danger-subtle-fg **:[.text-muted-fg]:text-danger-subtle-fg/80",
				intent === "success" &&
					"bg-success-subtle text-success-subtle-fg **:[.text-muted-fg]:text-success-subtle-fg/80",
				className,
			])}
			{...props}
		>
			{IconComponent != null && indicator && (
				<div
					className={twJoin(
						"me-3 grid place-content-center rounded-full border-2 block-8 inline-8",
						intent === "warning" && "border-warning-subtle-fg/40",
						intent === "success" && "border-success-subtle-fg/40",
						intent === "danger" && "border-danger-subtle-fg/40",
						intent === "info" && "border-info-subtle-fg/40",
					)}
				>
					<div
						className={twJoin(
							"grid place-content-center rounded-full border-2 block-6 inline-6",
							intent === "warning" && "border-warning-subtle-fg/85",
							intent === "success" && "border-success-subtle-fg/85",
							intent === "danger" && "border-danger-subtle-fg/85",
							intent === "info" && "border-info-subtle-fg/85",
						)}
					>
						<IconComponent className="shrink-0 block-5 inline-5" />
					</div>
				</div>
			)}
			<div className="text-pretty group-has-[svg]:col-start-2">{props.children}</div>
		</div>
	);
}
