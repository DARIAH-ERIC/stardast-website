import { ChartColumn, FileText, Image, LayoutDashboard, LogOut, type LucideIcon, PanelsTopLeft } from "lucide-react";
import type { ReactNode } from "react";
import { I18nProvider } from "react-aria-components/I18nProvider";

import { Avatar } from "#/src/components/admin/ui/avatar.tsx";
import { buttonStyles } from "#/src/components/admin/ui/button.tsx";
import { Link } from "#/src/components/admin/ui/link.tsx";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarItem,
	SidebarLabel,
	SidebarProvider,
	SidebarSection,
	SidebarTrigger,
} from "#/src/components/admin/ui/sidebar.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/src/components/admin/ui/tooltip.tsx";

/** Icon names, since props passed from astro to an island must be serialisable. */
const icons = {
	dashboard: LayoutDashboard,
	analytics: ChartColumn,
	collection: FileText,
	media: Image,
	singleton: PanelsTopLeft,
} satisfies Record<string, LucideIcon>;

export interface NavigationItem {
	href: string;
	label: string;
	icon: keyof typeof icons;
}

export interface NavigationSection {
	id: string;
	/** Omitted for the first section, e.g. the dashboard link. */
	title?: string;
	items: Array<NavigationItem>;
}

export interface AdminNavigationProps {
	sections: Array<NavigationSection>;
	/** The `href` of the item for the current page, which may be a parent page of it. */
	currentRoute: string | null;
	userName?: string;
}

function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.filter((part) => part !== "")
		.slice(0, 2)
		.map((part) => part[0]!.toUpperCase())
		.join("");
}

function Brand(): ReactNode {
	return (
		<Link href="/admin" className="flex items-center gap-2 rounded-sm text-fg">
			<img src="/assets/images/sparkle-stardast-blue.svg" alt="" className="block-6 inline-6" />
			<span className="font-semibold">STARDAST CMS</span>
		</Link>
	);
}

/**
 * The navigation sidebar: a permanent side panel on wide viewports, and a sheet opened from a top bar on narrow ones.
 *
 * On the server, and right after hydration, it renders the wide layout - which css hides on narrow viewports - so the
 * links are there before javascript has loaded.
 */
export function AdminNavigation(props: AdminNavigationProps): ReactNode {
	const { sections, currentRoute, userName } = props;

	return (
		<I18nProvider locale="en-GB">
			<SidebarProvider className="sticky inset-bs-0 z-30 flex-col md:@container-normal md:static md:shrink-0 md:inline-auto">
				<header className="flex items-center gap-2 border-be border-border bg-navbar px-2 block-14 md:hidden">
					<SidebarTrigger aria-label="Open navigation" />
					<Brand />
				</header>
				<Sidebar role="navigation" aria-label="CMS">
					<SidebarHeader>
						<Brand />
					</SidebarHeader>
					<SidebarContent>
						{sections.map((section) => (
							<SidebarSection
								key={section.id}
								className="py-2"
								{...(section.title != null ? { label: section.title } : {})}
							>
								{section.items.map((item) => {
									const Icon = icons[item.icon];

									return (
										<SidebarItem key={item.href} href={item.href} isCurrent={item.href === currentRoute}>
											<Icon aria-hidden={true} />
											<SidebarLabel>{item.label}</SidebarLabel>
										</SidebarItem>
									);
								})}
							</SidebarSection>
						))}
					</SidebarContent>
					<SidebarFooter className="justify-between gap-2 border-bs border-sidebar-border">
						<div className="flex items-center gap-2 min-inline-0">
							{userName != null && <Avatar size="sm" initials={getInitials(userName)} />}
							<span className="truncate text-sm">{userName}</span>
						</div>
						<form method="post" action="/api/cms/auth/logout">
							<Tooltip>
								<TooltipTrigger
									type="submit"
									aria-label="Sign out"
									className={buttonStyles({ intent: "plain", size: "sq-sm" })}
								>
									<LogOut aria-hidden={true} />
								</TooltipTrigger>
								<TooltipContent>Sign out</TooltipContent>
							</Tooltip>
						</form>
					</SidebarFooter>
				</Sidebar>
			</SidebarProvider>
		</I18nProvider>
	);
}
