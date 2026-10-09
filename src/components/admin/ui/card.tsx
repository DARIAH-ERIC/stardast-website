import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): ReactNode {
	return (
		<div
			data-slot="card"
			className={twMerge(
				"group/card flex flex-col gap-(--gutter) rounded-lg border bg-card py-(--gutter) text-card-fg shadow-xs [--gutter:--spacing(6)] **:data-[slot=table-header]:bg-muted/50 **:[table]:overflow-hidden has-[table]:overflow-hidden has-[table]:**:data-[slot=card-footer]:pbs-0 has-[table]:not-has-data-[slot=card-footer]:pbe-0",
				className,
			)}
			{...props}
		/>
	);
}

export interface HeaderProps extends React.HTMLAttributes<HTMLDivElement> {
	title?: string;
	description?: string;
}

export function CardHeader({ className, title, description, children, ...props }: HeaderProps): ReactNode {
	return (
		<div
			data-slot="card-header"
			className={twMerge(
				"grid auto-rows-min grid-rows-[auto_auto] items-start gap-1 px-(--gutter) has-data-[slot=card-action]:grid-cols-[1fr_auto]",
				className,
			)}
			{...props}
		>
			{title != null && title !== "" && <CardTitle>{title}</CardTitle>}
			{description != null && description !== "" && <CardDescription>{description}</CardDescription>}
			{(title == null || title === "") && typeof children === "string" ? <CardTitle>{children}</CardTitle> : children}
		</div>
	);
}

export function CardTitle({ className, ...props }: React.ComponentProps<"div">): ReactNode {
	return (
		<div
			data-slot="card-title"
			className={twMerge("font-display text-base/6 font-semibold text-balance", className)}
			{...props}
		/>
	);
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): ReactNode {
	return (
		<div
			{...props}
			data-slot="card-description"
			className={twMerge("row-start-2 text-sm/6 text-pretty text-muted-fg", className)}
			{...props}
		/>
	);
}

export function CardAction({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): ReactNode {
	return (
		<div
			data-slot="card-action"
			className={twMerge("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
			{...props}
		/>
	);
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): ReactNode {
	return (
		<div data-slot="card-content" className={twMerge("px-(--gutter) has-[table]:border-bs", className)} {...props} />
	);
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): ReactNode {
	return (
		<div
			data-slot="card-footer"
			className={twMerge(
				"flex items-center px-(--gutter) group-has-[table]/card:pbs-(--gutter) [.border-t]:pbs-6",
				className,
			)}
			{...props}
		/>
	);
}
