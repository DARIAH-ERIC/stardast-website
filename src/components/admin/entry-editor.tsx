import { ChevronLeft, EllipsisVertical, ExternalLink, Eye, Trash2, Undo2 } from "lucide-react";
import { type ReactNode, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Form } from "react-aria-components/Form";
import { I18nProvider } from "react-aria-components/I18nProvider";

import { config } from "#/src/cms/config.ts";
import { groupIssues, validate } from "#/src/components/admin/data.ts";
import { FieldsControl, FormContext } from "#/src/components/admin/field-control.tsx";
import { FieldLabel } from "#/src/components/admin/field-label.tsx";
import type { Option } from "#/src/components/admin/options.ts";
import { Badge, type BadgeProps } from "#/src/components/admin/ui/badge.tsx";
import { Button, buttonStyles } from "#/src/components/admin/ui/button.tsx";
import { Card, CardContent } from "#/src/components/admin/ui/card.tsx";
import { FieldError } from "#/src/components/admin/ui/field.tsx";
import { Heading } from "#/src/components/admin/ui/heading.tsx";
import { Input } from "#/src/components/admin/ui/input.tsx";
import { Link } from "#/src/components/admin/ui/link.tsx";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "#/src/components/admin/ui/menu.tsx";
import {
	ModalBody,
	ModalClose,
	ModalContent,
	ModalDescription,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from "#/src/components/admin/ui/modal.tsx";
import { Note } from "#/src/components/admin/ui/note.tsx";
import { TextField } from "#/src/components/admin/ui/text-field.tsx";
import type { AnyCollection, AnySingleton, Config } from "#/src/lib/cms/schema/config.ts";
import { slugify } from "#/src/lib/cms/slug.ts";

export type EditorTarget =
	| { kind: "collection"; collection: string; id?: string }
	| { kind: "singleton"; singleton: string };

export interface EntryEditorProps {
	target: EditorTarget;
	/** The revision `initialData` was read at - of the draft, if there is one. Saves fail if it changed since. */
	revision: string;
	initialData: unknown;
	hasDraft: boolean;
	isPublished: boolean;
	referenceOptions: Record<string, Array<Option>>;
	/** Where the "back" link, and deleting, lead. Defaults to the collection's entry list. */
	listUrl?: string;
}

type Action = "delete" | "discard" | "publish" | "save";

type Status =
	| { type: "busy"; action: Action }
	| { type: "done"; message: string }
	| { type: "error"; message: string }
	| { type: "idle" };

interface ErrorBody {
	message?: string;
	/** When github is rate limiting. */
	retryAt?: string;
	issues?: Array<{ path: string; message: string }>;
}

const { collections, singletons }: Config = config;

function getDescriptor(target: EditorTarget): AnyCollection | AnySingleton {
	return target.kind === "collection" ? collections[target.collection]! : singletons[target.singleton]!;
}

async function send(url: string, method: "DELETE" | "POST" | "PUT", body: unknown): Promise<Response> {
	return fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const busyLabels: Record<Action, string> = {
	delete: "Deleting…",
	discard: "Discarding draft…",
	publish: "Publishing…",
	save: "Saving draft…",
};

function formatTime(date: Date): string {
	return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function EntryEditor(props: EntryEditorProps): ReactNode {
	const { target, referenceOptions } = props;
	const descriptor = getDescriptor(target);
	const isNew = target.kind === "collection" && target.id == null;

	const [data, setData] = useState(props.initialData);
	const [revision, setRevision] = useState(props.revision);
	const [hasDraft, setHasDraft] = useState(props.hasDraft);
	const [isPublished, setIsPublished] = useState(props.isPublished);
	const [status, setStatus] = useState<Status>({ type: "idle" });
	const [showIssues, setShowIssues] = useState(false);
	const [serverIssues, setServerIssues] = useState<Array<{ path: string; message: string }>>([]);
	const [customId, setCustomId] = useState<string>();
	const [confirm, setConfirm] = useState<"delete" | "discard" | null>(null);
	const savedData = useRef(JSON.stringify(props.initialData));

	const isDirty = JSON.stringify(data) !== savedData.current;
	const isBusy = status.type === "busy";

	const clientIssues = useMemo(() => validate(descriptor.schema, data), [descriptor, data]);
	const issues = useMemo(() => groupIssues([...clientIssues, ...serverIssues]), [clientIssues, serverIssues]);

	const slugSource = descriptor.kind === "collection" ? (data as Record<string, unknown>)[descriptor.slug.from] : "";
	const id =
		target.kind === "collection" && target.id != null
			? target.id
			: (customId ?? slugify(typeof slugSource === "string" ? slugSource : ""));

	/** Only for new entries - see `Collection["id"]`. */
	const idIssues = useMemo(
		() => (isNew && descriptor.kind === "collection" ? validate(descriptor.idSchema, id) : []),
		[isNew, descriptor, id],
	);

	const title =
		descriptor.kind === "singleton"
			? descriptor.label
			: typeof slugSource === "string" && slugSource.trim() !== ""
				? slugSource
				: isNew
					? `New ${descriptor.label.toLowerCase()} entry`
					: id;

	const listUrl =
		props.listUrl ?? (target.kind === "collection" ? `/admin/collections/${target.collection}` : "/admin");
	const entryUrl =
		target.kind === "collection"
			? `/api/cms/collections/${target.collection}/entries/${id}`
			: `/api/cms/singletons/${target.singleton}`;
	const editUrl = target.kind === "collection" ? `/admin/collections/${target.collection}/entries/${id}` : undefined;

	/**
	 * Checks the latest state when the event fires, rather than the state of the last render - which would still be dirty
	 * when navigating away right after saving, e.g. to a newly created entry.
	 */
	const onBeforeUnload = useEffectEvent((event: BeforeUnloadEvent) => {
		if (JSON.stringify(data) !== savedData.current) {
			event.preventDefault();
		}
	});

	useEffect(() => {
		window.addEventListener("beforeunload", onBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", onBeforeUnload);
		};
	}, []);

	async function readError(response: Response): Promise<string> {
		const body = (await response.json().catch(() => {
			return {};
		})) as ErrorBody;

		setServerIssues(body.issues ?? []);

		if (response.status === 401) {
			return "Your session has expired. Sign in again in another tab, then try again.";
		}

		if (body.retryAt != null) {
			return `GitHub is limiting requests right now. Your changes are not lost - try again after ${formatTime(new Date(body.retryAt))}.`;
		}

		return body.message ?? `Something went wrong (${String(response.status)}).`;
	}

	async function run(action: Action): Promise<void> {
		setServerIssues([]);

		if (action === "save" || action === "publish") {
			setShowIssues(true);

			if (clientIssues.length > 0 || idIssues.length > 0) {
				setStatus({ type: "error", message: "Please fix the highlighted fields." });
				return;
			}
		}

		setStatus({ type: "busy", action });

		try {
			const response =
				action === "save"
					? await send(`${entryUrl}/draft`, "PUT", { data, revision })
					: action === "publish"
						? await send(`${entryUrl}/publish`, "POST", { data, revision })
						: action === "discard"
							? await send(`${entryUrl}/draft`, "DELETE", { revision })
							: await send(entryUrl, "DELETE", { revision });

			if (!response.ok) {
				setStatus({ type: "error", message: await readError(response) });
				return;
			}

			/** Nothing to lose anymore - no warning when navigating away below. */
			savedData.current = JSON.stringify(data);

			if (action === "delete") {
				window.location.assign(listUrl);
				return;
			}

			/** Shows the published version again. */
			if (action === "discard") {
				window.location.reload();
				return;
			}

			if (isNew && editUrl != null) {
				window.location.assign(editUrl);
				return;
			}

			const body = (await response.json()) as { revision: string };

			setRevision(body.revision);
			setShowIssues(false);

			if (action === "save") {
				setHasDraft(true);
				setStatus({ type: "done", message: `Draft saved at ${formatTime(new Date())}` });
			} else {
				setHasDraft(false);
				setIsPublished(true);
				setStatus({ type: "done", message: `Published at ${formatTime(new Date())}` });
			}
		} catch {
			setStatus({ type: "error", message: "The request failed. Check your connection, and try again." });
		}
	}

	const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
		if ((event.ctrlKey || event.metaKey) && event.key === "s") {
			event.preventDefault();

			if (!isBusy) {
				void run("save");
			}
		}
	});

	useEffect(() => {
		window.addEventListener("keydown", onKeyDown);

		return () => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, []);

	/** The url of the saved version - unsaved changes, e.g. to a date in the url, are not on the site, or in a preview. */
	const savedDataValue: unknown = JSON.parse(savedData.current);
	const siteUrl =
		descriptor.preview != null && !isNew ? descriptor.preview({ id, data: savedDataValue as never }) : undefined;

	const state: { label: string; intent: BadgeProps["intent"] } = isPublished
		? hasDraft
			? { label: "Unpublished changes", intent: "warning" }
			: { label: "Published", intent: "success" }
		: hasDraft
			? { label: "Draft, not published yet", intent: "secondary" }
			: { label: "Not saved yet", intent: "outline" };

	const confirmation =
		confirm === "discard"
			? {
					title: "Discard this draft?",
					description: `The unpublished changes to “${title}” will be lost. The published version stays as it is.`,
					action: "Discard draft",
				}
			: {
					title: "Delete this entry?",
					description: isPublished
						? `“${title}” will be removed from the website, together with any unpublished changes. It can only be restored from the repository history.`
						: `The draft of “${title}” will be deleted.`,
					action: "Delete",
				};

	/**
	 * The admin ui is english-only - also for editors whose browser prefers another language, for which react aria's
	 * strings are not bundled, see `astro.config.ts`.
	 */
	return (
		<I18nProvider locale="en-GB">
			<FormContext value={{ issues, showIssues, referenceOptions }}>
				<Form
					className="flex flex-col gap-6"
					validationBehavior="aria"
					onSubmit={(event) => {
						event.preventDefault();
						void run("save");
					}}
				>
					<div className="sticky inset-bs-14 z-20 -mx-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-be border-border bg-bg/95 p-4 backdrop-blur-md sm:-mx-6 sm:px-6 md:inset-bs-0 lg:-mx-10 lg:px-10">
						<div className="flex flex-col gap-1 min-inline-0">
							<Link
								href={listUrl}
								className="flex items-center gap-1 text-sm/6 font-normal text-muted-fg inline-fit hover:text-fg"
							>
								<ChevronLeft aria-hidden={true} className="block-4 inline-4" />
								{descriptor.label}
							</Link>
							<Heading className="truncate">{title}</Heading>
							<div className="flex flex-wrap items-center gap-2 text-sm/6">
								<Badge intent={state.intent}>{state.label}</Badge>
								<span aria-live="polite" className="text-muted-fg">
									{status.type === "busy" && busyLabels[status.action]}
									{status.type === "done" && !isDirty && status.message}
									{status.type !== "busy" && isDirty && "Unsaved changes"}
								</span>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							{siteUrl != null && hasDraft && (
								<Link
									href={`${siteUrl}${siteUrl.includes("?") ? "&" : "?"}preview`}
									target="_blank"
									rel="noreferrer"
									className={buttonStyles({ intent: "plain" })}
								>
									<Eye aria-hidden={true} />
									Preview
								</Link>
							)}
							{siteUrl != null && isPublished && (
								<Link href={siteUrl} target="_blank" rel="noreferrer" className={buttonStyles({ intent: "plain" })}>
									<ExternalLink aria-hidden={true} />
									View on site
								</Link>
							)}
							{((hasDraft && isPublished) || (target.kind === "collection" && !isNew)) && (
								<Menu>
									<MenuTrigger
										aria-label="More actions"
										isDisabled={isBusy}
										className={buttonStyles({ intent: "plain", size: "sq-md" })}
									>
										<EllipsisVertical aria-hidden={true} />
									</MenuTrigger>
									<MenuContent
										placement="bottom end"
										onAction={(key) => {
											setConfirm(key === "discard" ? "discard" : "delete");
										}}
									>
										{hasDraft && isPublished && (
											<MenuItem id="discard" textValue="Discard draft">
												<Undo2 aria-hidden={true} />
												<MenuLabel>Discard draft</MenuLabel>
											</MenuItem>
										)}
										{target.kind === "collection" && !isNew && (
											<MenuItem id="delete" textValue="Delete" intent="danger">
												<Trash2 aria-hidden={true} />
												<MenuLabel>Delete</MenuLabel>
											</MenuItem>
										)}
									</MenuContent>
								</Menu>
							)}
							<Button type="submit" intent="outline" isDisabled={isBusy}>
								Save draft
							</Button>
							<Button
								isDisabled={isBusy}
								onPress={() => {
									void run("publish");
								}}
							>
								Publish
							</Button>
						</div>
					</div>

					<ModalContent
						role="alertdialog"
						size="md"
						isOpen={confirm != null}
						onOpenChange={(isOpen) => {
							if (!isOpen) {
								setConfirm(null);
							}
						}}
					>
						{({ close }) => (
							<>
								<ModalHeader>
									<ModalTitle>{confirmation.title}</ModalTitle>
								</ModalHeader>
								<ModalBody>
									<ModalDescription>{confirmation.description}</ModalDescription>
								</ModalBody>
								<ModalFooter>
									<ModalClose intent="outline" autoFocus={true}>
										Cancel
									</ModalClose>
									<Button
										intent="danger"
										onPress={() => {
											const action = confirm ?? "delete";
											close();
											void run(action);
										}}
									>
										{confirmation.action}
									</Button>
								</ModalFooter>
							</>
						)}
					</ModalContent>

					{status.type === "error" && (
						<Note intent="danger" role="alert">
							{status.message}
						</Note>
					)}

					<Card className="[--gutter:--spacing(4)] sm:[--gutter:--spacing(6)]">
						<CardContent className="flex flex-col gap-6">
							{isNew && (
								<TextField
									value={id}
									onChange={(value) => {
										setCustomId(value === "" ? undefined : value);
									}}
									isInvalid={showIssues && idIssues.length > 0}
									validationBehavior="aria"
								>
									<FieldLabel
										label="Id"
										description="Used in the url. Derived from the title, unless changed. Cannot be changed later."
									/>
									<Input className="font-mono" />
									<FieldError>
										{id === "" ? "Enter an id." : idIssues.map((issue) => issue.message).join(" ")}
									</FieldError>
								</TextField>
							)}
							<FieldsControl fields={descriptor.fields} path={[]} value={data} onChange={setData} />
						</CardContent>
					</Card>
				</Form>
			</FormContext>
		</I18nProvider>
	);
}
