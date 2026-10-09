import type { ReactNode } from "react";

import { Description, Label } from "#/src/components/admin/ui/field.tsx";

/**
 * A field's label - marking optional rather than required fields, since most are required - and description.
 *
 * Inside a react aria field, the label and description are associated with its input. Custom widgets, e.g. the rich
 * text editor, render the label as a `span` instead, and reference it by `labelId`.
 */
export function FieldLabel(props: {
	label: string;
	description?: string;
	isOptional?: boolean;
	labelId?: string;
	descriptionId?: string;
	elementType?: "label" | "span";
}): ReactNode {
	const { label, description, isOptional = false, labelId, descriptionId, elementType = "label" } = props;

	return (
		<>
			<Label id={labelId} elementType={elementType} className="font-medium">
				{label}
				{isOptional && <span className="font-normal text-muted-fg"> (optional)</span>}
			</Label>
			{description != null && <Description id={descriptionId}>{description}</Description>}
		</>
	);
}
