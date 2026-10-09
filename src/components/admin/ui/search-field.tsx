import { SearchIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "react-aria-components/Button";
import type { InputProps } from "react-aria-components/Input";
import { SearchField as SearchFieldPrimitive, type SearchFieldProps } from "react-aria-components/SearchField";
import { twJoin } from "tailwind-merge";

import { fieldStyles } from "#/src/components/admin/ui/field.tsx";
import { Input, InputGroup } from "#/src/components/admin/ui/input.tsx";
import { cx } from "#/src/components/admin/ui/primitive.ts";

export function SearchField({ className, ...props }: SearchFieldProps): ReactNode {
	return (
		<SearchFieldPrimitive
			data-slot="control"
			aria-label={props["aria-label"] ?? "Search"}
			className={cx(fieldStyles({ className: "group/search-field" }), className)}
			{...props}
		/>
	);
}

export function SearchInput(props: InputProps): ReactNode {
	return (
		<InputGroup className="[--input-gutter-end:--spacing(8)]">
			<SearchIcon data-slot="icon" className="in-disabled:opacity-50" />
			<Input {...props} />
			<Button
				className={twJoin(
					"touch-target grid place-content-center text-muted-fg group-empty/search-field:invisible hover:text-fg pressed:text-fg",
					"px-3 py-2 sm:px-2.5 sm:py-1.5 sm:text-sm/5",
				)}
			>
				<XIcon className="block-5 inline-5 sm:block-4 sm:inline-4" />
			</Button>
		</InputGroup>
	);
}
