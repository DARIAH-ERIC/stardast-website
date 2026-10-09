import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { tv } from "tailwind-variants";

import { Link } from "#/src/components/admin/ui/link.tsx";
import { cx } from "#/src/components/admin/ui/primitive.ts";

export function Text({ className, ...props }: React.ComponentPropsWithoutRef<"p">): ReactNode {
	return <p data-slot="text" {...props} className={twMerge("text-base/6 text-muted-fg sm:text-sm/6", className)} />;
}

export const textLinkStyles = tv({
	base: "text-primary-subtle-fg decoration-primary-subtle-fg/50 hover:underline hover:decoration-primary-subtle-fg has-data-[slot=icon]:inline-flex has-data-[slot=icon]:items-center has-data-[slot=icon]:gap-x-1",
});

export function TextLink({ className, ...props }: React.ComponentPropsWithoutRef<typeof Link>): ReactNode {
	return <Link {...props} className={cx(textLinkStyles(), className)} />;
}

export function Strong({ className, ...props }: React.ComponentPropsWithoutRef<"strong">): ReactNode {
	return <strong {...props} className={twMerge("font-medium", className)} />;
}

export function Code({ className, ...props }: React.ComponentPropsWithoutRef<"code">): ReactNode {
	return (
		<code
			{...props}
			className={twMerge("rounded-sm border bg-muted px-0.5 text-sm font-medium sm:text-[0.8125rem]", className)}
		/>
	);
}
