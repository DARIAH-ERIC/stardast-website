import type { ReactNode } from "react";
import { TextField as TextFieldPrimitive, type TextFieldProps } from "react-aria-components/TextField";

import { fieldStyles } from "#/src/components/admin/ui/field.tsx";
import { cx } from "#/src/components/admin/ui/primitive.ts";

export function TextField({ className, ...props }: TextFieldProps): ReactNode {
	return <TextFieldPrimitive data-slot="control" className={cx(fieldStyles(), className)} {...props} />;
}
