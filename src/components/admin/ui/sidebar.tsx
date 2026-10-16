import { ChevronDownIcon } from "lucide-react";
import { type ReactNode, createContext, use, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button as ButtonPrimitive, type ButtonProps } from "react-aria-components/Button";
import { composeRenderProps } from "react-aria-components/composeRenderProps";
import {
	Disclosure,
	DisclosurePanel,
	type DisclosurePanelProps,
	type DisclosureProps,
} from "react-aria-components/Disclosure";
import { DisclosureGroup, type DisclosureGroupProps } from "react-aria-components/DisclosureGroup";
import { Heading } from "react-aria-components/Heading";
import type { LinkProps, LinkRenderProps } from "react-aria-components/Link";
import {
	NavigationTree,
	NavigationTreeItem,
	NavigationTreeItemContent,
	type NavigationTreeItemContentProps,
	type NavigationTreeItemProps,
	type NavigationTreeProps,
} from "react-aria-components/NavigationTree";
import { Separator, type SeparatorProps as SidebarSeparatorProps } from "react-aria-components/Separator";
import { twJoin, twMerge } from "tailwind-merge";

import { Button } from "#/src/components/admin/ui/button.tsx";
import { Link } from "#/src/components/admin/ui/link.tsx";
import { cx } from "#/src/components/admin/ui/primitive.ts";
import { SheetContent } from "#/src/components/admin/ui/sheet.tsx";
import { Tooltip, TooltipContent } from "#/src/components/admin/ui/tooltip.tsx";
import { TreeIndicator } from "#/src/components/admin/ui/tree.tsx";
import { useIsMobile } from "#/src/components/admin/ui/use-mobile.ts";

const SIDEBAR_WIDTH = "17rem";
const SIDEBAR_WIDTH_DOCK = "3.25rem";
const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

interface SidebarContextProps {
	state: "expanded" | "collapsed";
	open: boolean;
	setOpen: (open: boolean) => void;
	isOpenOnMobile: boolean;
	setIsOpenOnMobile: (open: boolean) => void;
	isMobile: boolean;
	toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextProps | null>(null);

const useSidebar = (): SidebarContextProps => {
	const context = use(SidebarContext);
	if (!context) {
		throw new Error("useSidebar must be used within a SidebarProvider.");
	}

	return context;
};

interface SidebarProviderProps extends React.ComponentProps<"div"> {
	defaultOpen?: boolean;
	isOpen?: boolean;
	shortcut?: string;
	onOpenChange?: (open: boolean) => void;
}

const SidebarProvider = ({
	defaultOpen = true,
	isOpen: openProp,
	onOpenChange: setOpenProp,
	className,
	style,
	children,
	shortcut = "b",
	ref,
	...props
}: SidebarProviderProps): ReactNode => {
	const [openMobile, setOpenMobile] = useState(false);

	const [internalOpenState, setInternalOpenState] = useState(defaultOpen);
	const open = openProp ?? internalOpenState;
	const setOpen = useCallback(
		(value: boolean | ((value: boolean) => boolean)) => {
			const openState = typeof value === "function" ? value(open) : value;

			if (setOpenProp) {
				setOpenProp(openState);
			} else {
				setInternalOpenState(openState);
			}

			document.cookie = `${SIDEBAR_COOKIE_NAME}=${String(openState)}; path=/; max-age=${String(SIDEBAR_COOKIE_MAX_AGE)}`;
		},
		[setOpenProp, open],
	);

	const isMobile = useIsMobile();
	const isMobileRef = useRef(isMobile);
	isMobileRef.current = isMobile;

	const toggleSidebar = useCallback(() => {
		if (isMobileRef.current) {
			setOpenMobile((prev) => !prev);
		} else {
			setOpen((prev) => !prev);
		}
	}, [setOpen]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === shortcut && (event.metaKey || event.ctrlKey)) {
				const activeElement = document.activeElement;

				const isInTextInput =
					activeElement instanceof HTMLInputElement ||
					activeElement instanceof HTMLTextAreaElement ||
					activeElement?.getAttribute("contenteditable") === "true" ||
					activeElement?.getAttribute("role") === "textbox";

				if (!isInTextInput) {
					event.preventDefault();
					toggleSidebar();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [toggleSidebar, shortcut]);

	const state = open ? "expanded" : "collapsed";

	const contextValue = useMemo<SidebarContextProps>(() => {
		return {
			state,
			open,
			setOpen,
			isMobile,
			isOpenOnMobile: openMobile,
			setIsOpenOnMobile: setOpenMobile,
			toggleSidebar,
		};
	}, [state, open, setOpen, isMobile, openMobile, toggleSidebar]);

	return (
		<SidebarContext value={contextValue}>
			<div
				style={
					{
						"--sidebar-width": SIDEBAR_WIDTH,
						"--sidebar-width-dock": SIDEBAR_WIDTH_DOCK,
						...style,
					} as React.CSSProperties
				}
				className={twMerge(
					"@container **:[svg]:shrink-0",
					"flex text-sidebar-fg inline-full",
					"group/sidebar-root peer/sidebar-root dark:has-data-[intent=inset]:bg-bg has-data-[intent=inset]:bg-sidebar",
					className,
				)}
				ref={ref}
				{...props}
			>
				{children}
			</div>
		</SidebarContext>
	);
};

interface SidebarProps extends React.ComponentProps<"div"> {
	intent?: "default" | "float" | "inset";
	collapsible?: "hidden" | "dock" | "none";
	side?: "left" | "right";
}

const Sidebar = ({
	children,
	collapsible = "hidden",
	side = "left",
	intent = "default",
	className,
	...props
}: SidebarProps): ReactNode => {
	const { isMobile, state, isOpenOnMobile, setIsOpenOnMobile } = useSidebar();
	if (collapsible === "none") {
		return (
			<div
				data-intent={intent}
				data-collapsible="none"
				data-slot="sidebar"
				className={twMerge("flex flex-col bg-sidebar text-sidebar-fg block-full inline-(--sidebar-width)", className)}
				{...props}
			>
				{children}
			</div>
		);
	}

	if (isMobile) {
		return (
			<>
				<span className="sr-only" aria-hidden data-intent={intent} />
				<SheetContent
					isOpen={isOpenOnMobile}
					onOpenChange={setIsOpenOnMobile}
					data-slot="sidebar"
					data-intent="default"
					className="[--sidebar-width:18rem] inline-(--sidebar-width) entering:blur-in exiting:blur-out has-data-[slot=calendar]:[--sidebar-width:23rem]"
					position={side}
				>
					<Heading slot="title" className="sr-only">
						Sidebar
					</Heading>
					{children}
				</SheetContent>
			</>
		);
	}

	return (
		<div
			data-state={state}
			data-collapsible={state === "collapsed" ? collapsible : ""}
			data-intent={intent}
			data-side={side}
			data-slot="sidebar"
			className="group peer hidden text-sidebar-fg md:block"
			{...props}
		>
			<div
				data-slot="sidebar-gap"
				aria-hidden="true"
				className={twMerge([
					"inline-(--sidebar-width) group-data-[collapsible=hidden]:inline-0",
					"group-data-[side=right]:-rotate-180",
					"relative bg-transparent transition-[width] duration-200 ease-linear block-svh",
					intent === "default" && "group-data-[collapsible=dock]:inline-(--sidebar-width-dock)",
					intent === "float" && "group-data-[collapsible=dock]:inline-[calc(var(--sidebar-width-dock)+(--spacing(4)))]",
					intent === "inset" && "group-data-[collapsible=dock]:inline-[calc(var(--sidebar-width-dock)+(--spacing(2)))]",
				])}
			/>
			<div
				data-slot="sidebar-container"
				className={twMerge(
					"fixed inset-y-0 z-10 hidden bg-sidebar inline-(--sidebar-width) md:flex not-has-data-[slot=sidebar-footer]:pbe-2",
					"transition-[left,right,width] duration-200 ease-linear",
					side === "left" && "inset-s-0 group-data-[collapsible=hidden]:-inset-s-(--sidebar-width)",
					side === "right" && "inset-e-0 group-data-[collapsible=hidden]:-inset-e-(--sidebar-width)",
					intent === "float" && "bg-bg p-2 group-data-[collapsible=dock]:inline-[calc(--spacing(4)+2px)]",
					intent === "inset" &&
						"dark:bg-bg group-data-[collapsible=dock]:inline-[calc(var(--sidebar-width-dock)+(--spacing(2))+2px)]",
					intent === "default" && [
						"group-data-[collapsible=dock]:inline-(--sidebar-width-dock)",
						"border-sidebar-border group-data-[side=left]:border-e group-data-[side=right]:border-s",
					],
					className,
				)}
			>
				<div
					data-sidebar="default"
					data-slot="sidebar-inner"
					className={twJoin(
						"flex flex-col text-sidebar-fg block-full inline-full",
						"group-data-[intent=float]:rounded-lg group-data-[intent=float]:border group-data-[intent=float]:border-sidebar-border group-data-[intent=float]:bg-sidebar group-data-[intent=float]:shadow-xs",
					)}
				>
					{children}
				</div>
			</div>
		</div>
	);
};

const SidebarHeader = ({ className, ref, ...props }: React.ComponentProps<"div">): ReactNode => {
	const { state } = useSidebar();
	return (
		<div
			ref={ref}
			data-slot="sidebar-header"
			className={twMerge(
				"flex flex-col gap-2 p-2.5 [.border-b]:border-sidebar-border",
				"in-data-[intent=inset]:p-4",
				state === "collapsed" ? "items-center p-2.5" : "p-4",
				className,
			)}
			{...props}
		/>
	);
};

const SidebarFooter = ({ className, ...props }: React.ComponentProps<"div">): ReactNode => (
	<div
		data-slot="sidebar-footer"
		className={twMerge([
			"mbs-auto flex shrink-0 items-center justify-center p-4 **:data-[slot=chevron]:text-muted-fg",
			"in-data-[intent=inset]:px-6 in-data-[intent=inset]:py-4",
			className,
		])}
		{...props}
	/>
);

const SidebarContent = ({ className, ...props }: React.ComponentProps<"div">): ReactNode => {
	const { state } = useSidebar();
	const [isAtBottom, setIsAtBottom] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}

		const check = () => {
			const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 1;
			setIsAtBottom(atBottom);
		};

		check();
		el.addEventListener("scroll", check, { passive: true });

		const observer = new ResizeObserver(check);
		observer.observe(el);

		return () => {
			el.removeEventListener("scroll", check);
			observer.disconnect();
		};
	}, []);

	return (
		<div
			ref={ref}
			data-slot="sidebar-content"
			className={twMerge(
				"flex flex-1 scroll-mbe-96 flex-col overflow-auto min-block-0 *:data-[slot=sidebar-section]:border-s-0",
				state === "collapsed" ? "items-center" : !isAtBottom && "mask-b-from-95%",
				className,
			)}
			{...props}
		>
			{props.children}
		</div>
	);
};

const SidebarSectionGroup = ({ className, ...props }: React.ComponentProps<"section">): ReactNode => {
	const { state, isMobile } = useSidebar();
	const collapsed = state === "collapsed" && !isMobile;
	return (
		<section
			data-slot="sidebar-section-group"
			className={twMerge(
				"flex flex-col gap-y-0.5 inline-full min-inline-0",
				collapsed && "items-center justify-center",
				className,
			)}
			{...props}
		/>
	);
};

interface SidebarSectionProps extends React.ComponentProps<"div"> {
	label?: string;
}

/**
 * A labelled section is a group named by its label - not a `<header>`, which outside of e.g. an article is the page's
 * banner landmark.
 */
const SidebarSection = ({ className, ...props }: SidebarSectionProps): ReactNode => {
	const { state } = useSidebar();
	const labelId = useId();
	const hasLabel = state !== "collapsed" && "label" in props;
	return (
		<div
			data-slot="sidebar-section"
			{...(hasLabel ? { role: "group", "aria-labelledby": labelId } : {})}
			className={twMerge(
				"col-span-full flex flex-col gap-y-0.5 min-inline-0 **:data-[slot=sidebar-section]:**:gap-y-0",
				"p-4 in-data-[state=collapsed]:p-2",
				className,
			)}
			{...props}
		>
			{hasLabel && (
				<div
					id={labelId}
					className="mbe-1 flex shrink-0 items-center rounded-md px-2 text-xs/6 text-sidebar-fg/70 ring-sidebar-ring transition-[margin,opa] duration-200 ease-linear outline-none *:[svg]:shrink-0 *:[svg]:block-4 *:[svg]:inline-4 group-data-[collapsible=dock]:-mbs-8 group-data-[collapsible=dock]:opacity-0"
				>
					{props.label}
				</div>
			)}
			<div
				data-slot="sidebar-section-inner"
				className="grid grid-cols-[auto_1fr] gap-y-0.5 *:data-[slot=control]:col-span-full in-data-[state=collapsed]:gap-y-1.5"
			>
				{props.children}
			</div>
		</div>
	);
};

interface SidebarItemProps extends Omit<React.ComponentProps<typeof Link>, "children"> {
	isCurrent?: boolean;
	children?:
		| React.ReactNode
		| ((values: LinkRenderProps & { defaultChildren: React.ReactNode; isCollapsed: boolean }) => React.ReactNode);
	tooltip?: string | React.ComponentProps<typeof TooltipContent>;
}

const SidebarItem = ({ isCurrent, tooltip, children, className, ref, ...props }: SidebarItemProps): ReactNode => {
	const { state, isMobile } = useSidebar();
	const isCollapsed = state === "collapsed" && !isMobile;
	const link = (
		<Link
			ref={ref}
			data-slot="sidebar-item"
			aria-current={isCurrent === true ? "page" : undefined}
			className={composeRenderProps(className, (className, { isFocusVisible, isPressed, isHovered, isDisabled }) =>
				twMerge(
					"items-center rounded-lg p-2 text-start text-base/6 font-medium text-sidebar-fg inline-full min-inline-0 has-[a]:p-0",
					"group/sidebar-item relative col-span-full overflow-hidden focus-visible:outline-hidden",
					"grid grid-cols-[auto_1fr_1.5rem_0.5rem_auto] sm:text-sm/5 **:last:[svg]:ms-auto supports-[grid-template-columns:subgrid]:grid-cols-subgrid",
					// icon
					"sm:[&_svg:not([class*='size-'])]:block-4 sm:[&_svg:not([class*='size-'])]:inline-4 **:[svg]:shrink-0 [&_svg:not([class*='size-'])]:block-5 [&_svg:not([class*='size-'])]:inline-5 [&_svg:not([class*='text-'])]:text-muted-fg",
					"**:last:[svg]:block-5 **:last:[svg]:inline-5 sm:**:last:[svg]:block-4 sm:**:last:[svg]:inline-4",
					"[&:has(svg+[data-slot=sidebar-label])_svg:has(+[data-slot=sidebar-label])]:me-2",

					// avatar
					"**:data-[slot=avatar]:[--avatar-size:--spacing(5)]",
					"[&:has([data-slot=avatar]+[data-slot=sidebar-label])_[data-slot=avatar]:has(+[data-slot=sidebar-label])]:me-2",
					"[--sidebar-current-bg:var(--color-sidebar-primary)] [--sidebar-current-fg:var(--color-sidebar-primary-fg)]",
					isCurrent === true &&
						"font-medium text-(--sidebar-current-fg) hover:bg-(--sidebar-current-bg) hover:text-(--sidebar-current-fg) hover:[&_svg:not([class*='text-'])]:text-(--sidebar-current-fg) [&_.text-muted-fg]:text-fg/80 [&_svg:not([class*='text-'])]:text-(--sidebar-current-fg)",
					isFocusVisible && "inset-ring inset-ring-sidebar-ring outline-hidden",
					isPressed && "bg-sidebar-accent text-sidebar-accent-fg [&_svg:not([class*='text-'])]:text-sidebar-accent-fg",
					isHovered && "bg-sidebar-accent text-sidebar-accent-fg [&_svg:not([class*='text-'])]:text-sidebar-accent-fg",
					isDisabled && "opacity-50",
					className,
				),
			)}
			{...props}
		>
			{(values) => <>{typeof children === "function" ? children({ ...values, isCollapsed }) : children}</>}
		</Link>
	);
	const tooltipProps = typeof tooltip === "string" ? { children: tooltip } : tooltip;

	return (
		<Tooltip delay={0}>
			{link}
			<TooltipContent
				className="**:data-[slot=sidebar-label-mask]:hidden **:[svg]:hidden"
				inverse
				placement="right"
				arrow
				hidden={!isCollapsed || isMobile || tooltip == null || tooltip === ""}
				{...tooltipProps}
			/>
		</Tooltip>
	);
};

function SidebarBadge({ className, ...props }: React.ComponentProps<"span">): ReactNode {
	const { state, isMobile } = useSidebar();

	if (state === "collapsed" && !isMobile) {
		return (
			<span
				aria-hidden
				data-slot="sidebar-badge"
				className="absolute inset-e-1 inset-bs-1 rounded-full bg-primary block-1.5 inline-1.5"
			/>
		);
	}

	return (
		<span
			data-slot="sidebar-badge"
			className={twMerge(
				"absolute inset-y-1/2 inset-e-1.5 -translate-y-1/2 rounded-full bg-fg/5 px-2 text-[10px]/5.5 inset-ring-1 inset-ring-sidebar-border block-5.5 inline-auto group-hover/sidebar-item:inset-ring-muted-fg/30 group-current:inset-ring-transparent",
				className,
			)}
			{...props}
		/>
	);
}

interface SidebarLinkProps extends LinkProps {
	ref?: React.RefObject<HTMLAnchorElement>;
}

const SidebarLink = ({ className, ref, ...props }: SidebarLinkProps): ReactNode => (
	<Link
		ref={ref}
		className={cx(
			"col-span-full shrink-0 items-center p-2 min-inline-0 focus:outline-hidden",
			"grid grid-cols-[auto_1fr_1.5rem_0.5rem_auto] supports-[grid-template-columns:subgrid]:grid-cols-subgrid",
			className,
		)}
		{...props}
	/>
);

const SidebarInset = ({ className, ref, ...props }: React.ComponentProps<"main">): ReactNode => (
	<main
		data-slot="sidebar-inset"
		ref={ref}
		className={twMerge(
			"relative flex flex-1 flex-col bg-bg inline-full lg:min-inline-0",
			"md:group-has-data-[intent=inset]/sidebar-root:border group-has-data-[intent=inset]/sidebar-root:border-sidebar-border group-has-data-[intent=inset]/sidebar-root:bg-muted",
			"md:group-has-data-[intent=inset]/sidebar-root:m-2",
			"md:group-has-data-[side=left]:group-has-data-[intent=inset]/sidebar-root:ms-0",
			"md:group-has-data-[side=right]:group-has-data-[intent=inset]/sidebar-root:me-0",
			"md:group-has-data-[intent=inset]/sidebar-root:rounded-2xl",
			"md:group-has-data-[intent=inset]/sidebar-root:peer-data-[state=collapsed]:ms-2",
			className,
		)}
		{...props}
	/>
);

type SidebarDisclosureGroupProps = DisclosureGroupProps;
const SidebarDisclosureGroup = ({
	allowsMultipleExpanded = true,
	className,
	...props
}: SidebarDisclosureGroupProps): ReactNode => (
	<DisclosureGroup
		data-slot="sidebar-disclosure-group"
		allowsMultipleExpanded={allowsMultipleExpanded}
		className={cx("col-span-full flex flex-col gap-y-0.5 min-inline-0 in-data-[state=collapsed]:gap-y-1.5", className)}
		{...props}
	/>
);

interface SidebarDisclosureProps extends DisclosureProps {
	ref?: React.Ref<HTMLDivElement>;
}

const SidebarDisclosure = ({ className, ref, ...props }: SidebarDisclosureProps): ReactNode => {
	const { state } = useSidebar();
	return (
		<Disclosure
			ref={ref}
			data-slot="sidebar-disclosure"
			className={cx("col-span-full min-inline-0", state === "collapsed" ? "px-2" : "px-4", className)}
			{...props}
		/>
	);
};

interface SidebarDisclosureTriggerProps extends ButtonProps {
	ref?: React.Ref<HTMLButtonElement>;
}

const SidebarDisclosureTrigger = ({ className, ref, ...props }: SidebarDisclosureTriggerProps): ReactNode => {
	const { state } = useSidebar();
	return (
		<Heading level={3}>
			<ButtonPrimitive
				ref={ref}
				slot="trigger"
				className={composeRenderProps(className, (className, { isPressed, isFocusVisible, isHovered, isDisabled }) =>
					twMerge(
						"flex items-center rounded-lg text-start text-base/6 font-medium text-sidebar-fg inline-full min-inline-0",
						"group/sidebar-disclosure-trigger relative col-span-full overflow-hidden focus-visible:outline-hidden",
						"**:[svg]:shrink-0 **:[svg]:text-muted-fg **:[svg]:block-5 **:[svg]:inline-5 sm:**:[svg]:block-4 sm:**:[svg]:inline-4",
						"**:last:[svg]:block-5 **:last:[svg]:inline-5 sm:**:last:[svg]:block-4 sm:**:last:[svg]:inline-4",
						"**:data-[slot=avatar]:block-6 **:data-[slot=avatar]:inline-6 sm:**:data-[slot=avatar]:block-5 sm:**:data-[slot=avatar]:inline-5",
						"col-span-full gap-3 p-2 **:last:[svg]:ms-auto **:data-[slot=chevron]:text-muted-fg sm:gap-2 sm:text-sm/5",

						isFocusVisible && "inset-ring inset-ring-ring/70",
						(isPressed || isHovered) &&
							"bg-sidebar-accent text-sidebar-accent-fg **:last:[svg]:text-sidebar-accent-fg **:data-[slot=chevron]:text-sidebar-accent-fg **:[svg]:text-sidebar-accent-fg",
						isDisabled && "opacity-50",
						className,
					),
				)}
				{...props}
			>
				{(values) => (
					<>
						{typeof props.children === "function" ? props.children(values) : props.children}
						{state !== "collapsed" && (
							<ChevronDownIcon
								data-slot="chevron"
								className="z-10 ms-auto transition-transform duration-200 block-3.5 inline-3.5 group-aria-expanded/sidebar-disclosure-trigger:rotate-180"
							/>
						)}
					</>
				)}
			</ButtonPrimitive>
		</Heading>
	);
};

const SidebarDisclosurePanel = ({ className, ...props }: DisclosurePanelProps): ReactNode => (
	<DisclosurePanel
		data-slot="sidebar-disclosure-panel"
		className={cx("overflow-clip transition-[height] duration-200 block-(--disclosure-panel-height)", className)}
		{...props}
	>
		<div
			data-slot="sidebar-disclosure-panel-content"
			className="col-span-full grid grid-cols-[auto_1fr] gap-y-0.5 in-data-[state=collapsed]:gap-y-1.5"
		>
			{props.children}
		</div>
	</DisclosurePanel>
);

const SidebarSeparator = ({ className, ...props }: SidebarSeparatorProps): ReactNode => (
	<Separator
		data-slot="sidebar-separator"
		orientation="horizontal"
		className={twMerge(
			"mx-auto border-0 bg-sidebar-border block-px inline-[calc(var(--sidebar-width)-(--spacing(10)))] forced-colors:bg-[ButtonBorder]",
			className,
		)}
		{...props}
	/>
);

const SidebarTrigger = ({ onPress, className, children, ...props }: React.ComponentProps<typeof Button>): ReactNode => {
	const { toggleSidebar } = useSidebar();
	return (
		<Button
			aria-label={props["aria-label"] ?? "Toggle Sidebar"}
			data-slot="sidebar-trigger"
			intent={props.intent ?? "plain"}
			size={props.size ?? "sq-sm"}
			className={cx("shrink-0", className)}
			onPress={(event) => {
				onPress?.(event);
				toggleSidebar();
			}}
			{...props}
		>
			{children ?? (
				<>
					<svg
						className="block-4 inline-4"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						width={16}
						height={16}
						fill="currentcolor"
					>
						<path d="M13.25 2.5c.69 0 1.25.56 1.25 1.25v8.5c0 .69-.56 1.25-1.25 1.25H7.5V15h5.75A2.75 2.75 0 0 0 16 12.25v-8.5A2.75 2.75 0 0 0 13.25 1H7.5v1.5zM5.75 1a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-3A2.75 2.75 0 0 1 0 12.25v-8.5A2.75 2.75 0 0 1 2.75 1z" />
					</svg>
					<span className="sr-only">Toggle Sidebar</span>
				</>
			)}
		</Button>
	);
};

const SidebarRail = ({ className, ref, ...props }: React.ComponentProps<"button">): ReactNode => {
	const { toggleSidebar } = useSidebar();

	return (
		props.children ?? (
			<button
				ref={ref}
				data-slot="sidebar-rail"
				aria-label="Toggle Sidebar"
				title="Toggle Sidebar"
				tabIndex={-1}
				onClick={toggleSidebar}
				className={twMerge(
					"absolute inset-y-0 z-20 hidden -translate-x-1/2 outline-hidden transition-all ease-linear inline-4 after:absolute after:inset-y-0 after:inset-s-1/2 after:inline-0.5 hover:after:bg-transparent sm:flex group-data-[side=left]:-inset-e-4 group-data-[side=right]:inset-s-0",
					"in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
					"[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
					"group-data-[collapsible=hidden]:translate-x-0 group-data-[collapsible=hidden]:after:inset-s-full group-data-[collapsible=hidden]:hover:bg-sidebar-accent",
					"[[data-side=left][data-collapsible=hidden]_&]:-inset-e-2 [[data-side=right][data-collapsible=hidden]_&]:-inset-s-2",
					className,
				)}
				{...props}
			/>
		)
	);
};

function SidebarLabel({ className, ref, ...props }: React.ComponentProps<"span">): ReactNode {
	const { state, isMobile } = useSidebar();
	const collapsed = state === "collapsed" && !isMobile;
	if (!collapsed) {
		return (
			<span
				data-slot="sidebar-label"
				tabIndex={-1}
				ref={ref}
				className={twMerge("col-start-2 truncate pe-6 outline-hidden", className)}
				{...props}
			/>
		);
	}
	return null;
}

interface SidebarNavProps extends React.ComponentProps<"nav"> {
	isSticky?: boolean;
}

const SidebarNav = ({ isSticky = false, className, ...props }: SidebarNavProps): ReactNode => (
	<nav
		data-slot="sidebar-nav"
		className={twMerge(
			"isolate flex items-center justify-between gap-x-2 px-(--container-padding,--spacing(4)) py-2.5 text-navbar-fg sm:justify-start sm:px-(--gutter,--spacing(4)) md:inline-full",
			isSticky && "static inset-bs-0 z-40 group-has-data-[intent=default]/sidebar-root:sticky",
			className,
		)}
		{...props}
	/>
);

interface SidebarMenuTriggerProps extends ButtonProps {
	alwaysVisible?: boolean;
}
const SidebarMenuTrigger = ({ alwaysVisible = false, className, ...props }: SidebarMenuTriggerProps): ReactNode => (
	<ButtonPrimitive
		className={cx(
			!alwaysVisible && "text-muted-fg opacity-0 hover:text-fg pressed:text-fg pressed:opacity-100",
			"absolute inset-e-0 flex items-center justify-end pe-2.5 outline-hidden block-full inline-[calc(var(--sidebar-width)-90%)]",
			"sm:[&_svg:not([class*='size-'])]:block-4 sm:[&_svg:not([class*='size-'])]:inline-4 pressed:[&_svg:not([class*='text-'])]:text-fg **:[svg]:shrink-0 [&_svg:not([class*='size-'])]:block-5 [&_svg:not([class*='size-'])]:inline-5",
			"group/sidebar-item:pressed:opacity-100 group-hover/sidebar-item:opacity-100 group-focus-visible/sidebar-item:opacity-100",
			"group/tree-item:pressed:opacity-100 group-hover/tree-item:opacity-100 group-focus-visible/tree-item:opacity-100",
			className,
		)}
		{...props}
	/>
);

interface SidebarTreeProps<T extends object> extends NavigationTreeProps<T> {}
function SidebarTree<T extends object>({ className, ...props }: SidebarTreeProps<T>): ReactNode {
	return (
		<NavigationTree
			className={cx(
				"col-span-full flex cursor-default flex-col gap-y-0.5 p-4 outline-hidden forced-color-adjust-none inline-full min-inline-0 in-data-[state=collapsed]:p-2",
				className,
			)}
			{...props}
		/>
	);
}

function SidebarTreeItem<T extends object>({ className, ...props }: NavigationTreeItemProps<T>): ReactNode {
	return (
		<NavigationTreeItem
			className={cx(
				"shrink-0 cursor-default outline-hidden select-none min-inline-0",
				"href" in props && "cursor-pointer",
				className,
			)}
			{...props}
		/>
	);
}

interface SidebarTreeContentProps extends NavigationTreeItemContentProps {
	className?: string;
	isCurrent?: boolean;
}

function SidebarTreeContent({ className, isCurrent, children }: SidebarTreeContentProps): ReactNode {
	return (
		<NavigationTreeItemContent>
			{(values) => (
				<div data-slot="sidebar-item-content" className="relative flex items-center inline-full min-inline-0">
					<div
						aria-hidden
						className="shrink-0"
						style={{
							width: `calc((var(--tree-item-level) - 1) * 1.25rem)`,
						}}
					/>
					<div
						className={twMerge(
							"group/tree-item flex flex-1 items-center gap-x-2 rounded-lg p-2 text-base/6 font-medium text-sidebar-fg min-inline-0 sm:text-sm/5",
							"sm:[&_svg:not([class*='size-'])]:block-4 sm:[&_svg:not([class*='size-'])]:inline-4 **:[svg]:-mx-0.5 **:[svg]:shrink-0 [&_svg:not([class*='size-'])]:block-5 [&_svg:not([class*='size-'])]:inline-5 [&_svg:not([class*='text-'])]:text-muted-fg",
							"hover:bg-sidebar-accent hover:text-sidebar-accent-fg hover:[&_svg:not([class*='text-'])]:text-sidebar-accent-fg",
							"[--sidebar-current-bg:var(--color-sidebar-primary)] [--sidebar-current-fg:var(--color-sidebar-primary-fg)]",
							values.isFocusVisible && "inset-ring inset-ring-sidebar-ring",
							values.isPressed &&
								"bg-sidebar-accent text-sidebar-accent-fg [&_svg:not([class*='text-'])]:text-sidebar-accent-fg",
							(values.isCurrent || isCurrent === true) &&
								"font-medium text-(--sidebar-current-fg) hover:bg-(--sidebar-current-bg) hover:text-(--sidebar-current-fg) hover:[&_svg:not([class*='text-'])]:text-(--sidebar-current-fg) [&_.text-muted-fg]:text-fg/80 [&_svg:not([class*='text-'])]:text-(--sidebar-current-fg)",
							values.isCurrentAncestor && "text-sidebar-accent-fg [&_svg:not([class*='text-'])]:text-sidebar-accent-fg",
							values.isDisabled && "opacity-50",
							className,
						)}
					>
						{values.hasChildItems && (
							<TreeIndicator
								values={{
									isDisabled: values.isDisabled,
									isExpanded: values.isExpanded,
								}}
							/>
						)}
						{typeof children === "function" ? children(values) : children}
					</div>
				</div>
			)}
		</NavigationTreeItemContent>
	);
}

interface SidebarTreeLinkProps extends Omit<LinkProps, "href"> {}

function SidebarTreeLink({ className, ...props }: SidebarTreeLinkProps): ReactNode {
	return (
		<Link
			data-slot="sidebar-tree-link"
			className={cx(
				"flex flex-1 items-center gap-x-2 outline-hidden min-inline-0 focus-visible:outline-hidden",
				className,
			)}
			{...props}
		/>
	);
}

function SidebarTreeLabel({ className, ...props }: React.ComponentProps<"span">): ReactNode {
	const { state, isMobile } = useSidebar();

	if (state === "collapsed" && !isMobile) {
		return null;
	}

	return (
		<span
			data-slot="sidebar-label"
			className={twMerge("col-start-2 truncate pe-6 outline-hidden", className)}
			{...props}
		/>
	);
}

export type {
	SidebarDisclosureGroupProps,
	SidebarDisclosureProps,
	SidebarDisclosureTriggerProps,
	SidebarItemProps,
	SidebarLinkProps,
	SidebarNavProps,
	SidebarProps,
	SidebarProviderProps,
	SidebarSectionProps,
	SidebarSeparatorProps,
};

export {
	Sidebar,
	SidebarContent,
	SidebarDisclosure,
	SidebarDisclosureGroup,
	SidebarDisclosurePanel,
	SidebarDisclosureTrigger,
	SidebarFooter,
	SidebarHeader,
	SidebarInset,
	SidebarBadge,
	SidebarItem,
	SidebarLabel,
	SidebarLink,
	SidebarMenuTrigger,
	SidebarNav,
	SidebarProvider,
	SidebarRail,
	SidebarSection,
	SidebarSectionGroup,
	SidebarSeparator,
	SidebarTree,
	SidebarTreeContent,
	SidebarTreeItem,
	SidebarTreeLabel,
	SidebarTreeLink,
	SidebarTrigger,
	useSidebar,
};
