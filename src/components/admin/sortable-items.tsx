import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2 } from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";
import { useDrag } from "react-aria-components/useDrag";
import { useDrop } from "react-aria-components/useDrop";
import { flushSync } from "react-dom";

import { moveItem } from "#/src/components/admin/data.ts";
import { Button } from "#/src/components/admin/ui/button.tsx";

let lastKey = 0;

function createKey(): string {
	lastKey += 1;
	return String(lastKey);
}

/** Dropping right before or after the dragged item would not move it. */
function isMove(from: number | null, position: number): boolean {
	return from != null && position !== from && position !== from + 1;
}

export interface SortableItems<T> {
	/**
	 * Client-only keys, since items have no ids of their own: keyed by index, react would keep e.g. a rich text editor,
	 * which only reads its initial value, at its position rather than with its item when items are reordered.
	 */
	keys: ReadonlyArray<string>;
	update: (index: number, item: T) => void;
	add: (item: T) => void;
	/** Moves the item at `from` to before the item at `before`, or to the end for `items.length`. */
	move: (from: number, before: number) => void;
	duplicate: (index: number) => void;
	remove: (index: number) => void;
	/** Only drags from this list are dropped in it - e.g. no cards among sections. */
	dragType: string;
	/** The index of the item being dragged. */
	dragging: number | null;
	/** `isNative` for pointer drags, which use the browser's drag and drop. */
	startDrag: (index: number, isNative: boolean) => void;
	endDrag: () => void;
	/** Whether dropping the dragged item at an insertion point would move it - up to date during a drag, unlike state. */
	canDropAt: (position: number) => boolean;
	dropAt: (position: number) => void;
	/** For a live region, since moves elsewhere in the list are not otherwise noticeable with a screen reader. */
	announcement: string;
}

/** The parts of `SortableItems` which do not depend on the item type, for the components below. */
export type SortableList = Omit<SortableItems<unknown>, "add" | "update">;

/**
 * Editing operations for the items of an array or blocks field, including reordering by drag and drop with mouse,
 * touch, keyboard, and screen readers: items are dragged by their `DragHandle`, and dropped on an `InsertionZone`.
 */
export function useSortableItems<T>(params: {
	items: ReadonlyArray<T>;
	onChange: (items: Array<T>) => void;
	/** E.g. "Cards 2", for announcements. */
	getLabel: (index: number) => string;
}): SortableItems<T> {
	const { items, onChange, getLabel } = params;
	const [storedKeys, setKeys] = useState(() => items.map(() => createKey()));
	const [dragging, setDragging] = useState<number | null>(null);
	const draggingRef = useRef<number | null>(null);
	const [announcement, setAnnouncement] = useState("");
	/**
	 * Announced only a while after a drop has ended: during keyboard drags, react aria makes everything but the drag
	 * handle and the drop targets inert - including the live region. Making the page interactive again makes the browser
	 * report all of its text as new, which screen readers like orca skip as a flood of events - along with the
	 * announcement, if it is made right away.
	 */
	const pendingAnnouncement = useRef<string | null>(null);
	/** Browsers lowercase drag types. */
	const dragType = `application/x-cms-item-${useId()
		.replaceAll(/[^a-z0-9]/gi, "")
		.toLowerCase()}`;

	/** The items were replaced rather than edited here - which ones are the same cannot be told, so start over. */
	let keys = storedKeys;

	if (keys.length !== items.length) {
		keys = items.map(() => createKey());
		setKeys(keys);
	}

	function commit(nextItems: Array<T>, nextKeys: Array<string>): void {
		setKeys(nextKeys);
		onChange(nextItems);
	}

	function move(from: number, before: number, isDrop = false): void {
		commit(moveItem(items, from, before), moveItem(keys, from, before));

		const position = before > from ? before : before + 1;
		const message = `${getLabel(from)} moved to position ${String(position)} of ${String(items.length)}.`;

		if (isDrop) {
			pendingAnnouncement.current = message;
		} else {
			setAnnouncement(message);
		}
	}

	return {
		keys,
		update(index, item) {
			onChange(items.map((current, itemIndex) => (itemIndex === index ? item : current)));
		},
		add(item) {
			commit([...items, item], [...keys, createKey()]);
		},
		move,
		duplicate(index) {
			commit(items.toSpliced(index + 1, 0, structuredClone(items[index]!)), keys.toSpliced(index + 1, 0, createKey()));
		},
		remove(index) {
			commit(items.toSpliced(index, 1), keys.toSpliced(index, 1));
		},
		dragType,
		dragging,
		startDrag(index, isNative) {
			draggingRef.current = index;

			/** Changing the dom during `dragstart` cancels the drag, at least in chromium. */
			if (isNative) {
				setTimeout(() => {
					if (draggingRef.current === index) {
						setDragging(index);
					}
				}, 0);
				return;
			}

			/**
			 * Shows the insertion zones right away: when dragging with the keyboard, react aria focuses the first one as soon
			 * as this returns - which must then already be labelled.
			 */
			flushSync(() => {
				setDragging(index);
			});
		},
		endDrag() {
			draggingRef.current = null;
			setDragging(null);

			const message = pendingAnnouncement.current;
			pendingAnnouncement.current = null;

			if (message != null) {
				setTimeout(() => {
					setAnnouncement(message);
				}, 750);
			}
		},
		canDropAt(position) {
			return isMove(draggingRef.current, position);
		},
		/** Called before `endDrag`, both for pointer and keyboard drops. */
		dropAt(position) {
			const from = draggingRef.current;

			if (from != null && isMove(from, position)) {
				move(from, position, true);
			}
		},
		announcement,
	};
}

/** Starts dragging with the pointer, or with enter for keyboard and screen reader users. */
export function DragHandle(props: { sortable: SortableList; index: number; label: string }): ReactNode {
	const { sortable, index, label } = props;
	const ref = useRef<HTMLDivElement>(null);
	/** React aria starts keyboard and pointer drags with the same callback. */
	const isNativeDrag = useRef(false);
	const wasNativeDrag = useRef(false);

	const { dragProps } = useDrag({
		getItems() {
			return [{ [sortable.dragType]: label }];
		},
		getAllowedDropOperations() {
			return ["move"];
		},
		onDragStart() {
			wasNativeDrag.current = isNativeDrag.current;
			sortable.startDrag(index, isNativeDrag.current);
		},
		onDragEnd(event) {
			sortable.endDrag();

			/**
			 * Focus was on the insertion zone, which is gone after dropping - so it follows the item instead, like it does
			 * with the move buttons. React aria already restores it when cancelling.
			 */
			if (!wasNativeDrag.current && event.dropOperation !== "cancel") {
				requestAnimationFrame(() => {
					ref.current?.focus();
				});
			}
		},
	});

	return (
		<div
			ref={ref}
			{...dragProps}
			/** Shows the whole item under the pointer, rather than just the handle. */
			onDragStart={(event) => {
				isNativeDrag.current = true;
				dragProps.onDragStart?.(event);
				isNativeDrag.current = false;

				const item = event.currentTarget.closest("li");

				if (item != null) {
					event.dataTransfer.setDragImage(item, 16, 16);
				}
			}}
			role="button"
			tabIndex={0}
			aria-label={`Drag ${label}`}
			className="flex shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-fg outline-offset-2 outline-ring block-8 inline-6 hover:bg-secondary hover:text-fg focus-visible:outline-2 active:cursor-grabbing"
		>
			<GripVertical aria-hidden={true} className="block-4 inline-4" />
		</div>
	);
}

/**
 * A drop target before the item at `position`, or after the last item for `items.length`. Always rendered, so that
 * react aria finds it when a drag starts, but only shown - and only exposed to assistive technology - while an item of
 * the same list is being dragged, and dropping it here would move it.
 */
export function InsertionZone(props: {
	sortable: SortableList;
	position: number;
	/** E.g. "before Cards 2", or "at the end". */
	label: string;
	className?: string;
}): ReactNode {
	const { sortable, position, label, className = "" } = props;
	const ref = useRef<HTMLDivElement>(null);

	const { dropProps, isDropTarget } = useDrop({
		ref,
		getDropOperation(types) {
			return types.has(sortable.dragType) && sortable.canDropAt(position) ? "move" : "cancel";
		},
		onDrop() {
			sortable.dropAt(position);
		},
	});

	if (!isMove(sortable.dragging, position)) {
		return <div ref={ref} {...dropProps} hidden={true} />;
	}

	return (
		<div
			ref={ref}
			{...dropProps}
			role="button"
			tabIndex={-1}
			aria-label={`Move here, ${label}`}
			className={`flex items-center justify-center rounded-lg border-2 border-dashed text-xs font-medium outline-none block-10 ${isDropTarget ? "border-primary bg-primary-subtle text-primary-subtle-fg" : "border-input text-muted-fg"} ${className}`}
		>
			Move here
		</div>
	);
}

/** Polite, so that it does not interrupt e.g. the label of the focused button. */
export function SortableAnnouncer(props: { sortable: SortableList }): ReactNode {
	return (
		<div aria-live="polite" className="sr-only">
			{props.sortable.announcement}
		</div>
	);
}

/** Move up, move down, duplicate, and remove controls for the items of arrays and blocks. */
export function ItemActions(props: { label: string; index: number; sortable: SortableList }): ReactNode {
	const { label, index, sortable } = props;
	const upRef = useRef<HTMLButtonElement>(null);
	const downRef = useRef<HTMLButtonElement>(null);
	const count = sortable.keys.length;

	/**
	 * Keeps focus on the pressed button, which react may have moved in the dom along with its item - or on the other one,
	 * if the pressed button is disabled now that the item is at either end of the list.
	 */
	function moveBy(offset: -1 | 1): void {
		flushSync(() => {
			sortable.move(index, offset === -1 ? index - 1 : index + 2);
		});

		const next = index + offset;
		const isAtEnd = offset === -1 ? next === 0 : next === count - 1;
		const pressed = offset === -1 ? upRef : downRef;
		const other = offset === -1 ? downRef : upRef;

		(isAtEnd ? other : pressed).current?.focus();
	}

	return (
		<div className="flex shrink-0 gap-0.5">
			<Button
				ref={upRef}
				intent="plain"
				size="sq-sm"
				aria-label={`Move ${label} up`}
				isDisabled={index === 0}
				onPress={() => {
					moveBy(-1);
				}}
			>
				<ArrowUp aria-hidden={true} />
			</Button>
			<Button
				ref={downRef}
				intent="plain"
				size="sq-sm"
				aria-label={`Move ${label} down`}
				isDisabled={index === count - 1}
				onPress={() => {
					moveBy(1);
				}}
			>
				<ArrowDown aria-hidden={true} />
			</Button>
			<Button
				intent="plain"
				size="sq-sm"
				aria-label={`Duplicate ${label}`}
				onPress={() => {
					sortable.duplicate(index);
				}}
			>
				<Copy aria-hidden={true} />
			</Button>
			<Button
				intent="plain"
				size="sq-sm"
				aria-label={`Remove ${label}`}
				onPress={() => {
					sortable.remove(index);
				}}
			>
				<Trash2 aria-hidden={true} />
			</Button>
		</div>
	);
}
