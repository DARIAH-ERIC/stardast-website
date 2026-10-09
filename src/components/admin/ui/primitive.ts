import { composeRenderProps } from "react-aria-components/composeRenderProps";
import { type ClassNameValue, twMerge } from "tailwind-merge";

type Render<T> = string | ((v: T) => string) | undefined;

/** Merges class names with a react aria component's `className`, which may be a function of its render props. */
export function cx<T = unknown>(...classes: [...Array<ClassNameValue>, Render<T>]): string | ((v: T) => string) {
	const className = classes.pop() as Render<T>;

	return composeRenderProps(className, (className) => twMerge(classes as Array<ClassNameValue>, className));
}
