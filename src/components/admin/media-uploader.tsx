import { CircleAlert, CircleCheck, Upload } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { Option } from "#/src/components/admin/options.ts";
import { DropZone } from "#/src/components/admin/ui/drop-zone.tsx";
import { FileTrigger } from "#/src/components/admin/ui/file-trigger.tsx";
import { Loader } from "#/src/components/admin/ui/loader.tsx";
import { Text } from "#/src/components/admin/ui/text.tsx";

interface UploadState {
	name: string;
	status: "done" | "error" | "uploading";
	message?: string;
}

/** Reads the pixel size of an image in the browser - the server never decodes uploads. */
async function getDimensions(file: File): Promise<{ width: number; height: number } | undefined> {
	if (!file.type.startsWith("image/")) {
		return undefined;
	}

	const url = URL.createObjectURL(file);

	try {
		const image = new Image();
		image.src = url;
		await image.decode();

		return image.naturalWidth > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : undefined;
	} catch {
		return undefined;
	} finally {
		URL.revokeObjectURL(url);
	}
}

async function readMessage(response: Response, fallback: string): Promise<string> {
	const body = (await response.json().catch(() => {
		return {};
	})) as { message?: string };

	return body.message ?? fallback;
}

/** Uploads a file: announces it, `PUT`s it - to s3 directly, or through the server - and creates its media entry. */
async function upload(file: File): Promise<Option> {
	const created = await fetch("/api/cms/media/uploads", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
	});

	if (!created.ok) {
		throw new Error(await readMessage(created, "The upload could not be started."));
	}

	const { id, key, url, headers } = (await created.json()) as {
		id: string;
		key: string;
		url: string;
		headers: Record<string, string>;
	};

	const uploaded = await fetch(url, { method: "PUT", headers, body: file });

	if (!uploaded.ok) {
		throw new Error(await readMessage(uploaded, "The file could not be uploaded."));
	}

	const completed = await fetch("/api/cms/media", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ id, key, filename: file.name, contentType: file.type, ...(await getDimensions(file)) }),
	});

	if (!completed.ok) {
		throw new Error(await readMessage(completed, "The upload could not be completed."));
	}

	return (await completed.json()) as Option;
}

export const acceptedTypes = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/avif",
	"image/gif",
	"image/svg+xml",
	"application/pdf",
];

export function MediaUploader(props: {
	/** Called for each uploaded file. Without it, the page reloads once all uploads are done. */
	onUploaded?: (option: Option) => void;
	allowsMultiple?: boolean;
}): ReactNode {
	const { onUploaded, allowsMultiple = true } = props;
	const [uploads, setUploads] = useState<Array<UploadState>>([]);

	async function uploadAll(files: Array<File>): Promise<void> {
		const accepted = files.filter((file) => acceptedTypes.includes(file.type));

		setUploads([
			...accepted.map((file) => {
				return { name: file.name, status: "uploading" as const };
			}),
			...files
				.filter((file) => !acceptedTypes.includes(file.type))
				.map((file) => {
					return { name: file.name, status: "error" as const, message: "This file type is not supported." };
				}),
		]);

		let failed = false;

		/** One after another, since every upload is a commit when files are stored in the repository. */
		for (const [index, file] of accepted.entries()) {
			try {
				// oxlint-disable-next-line no-await-in-loop
				const option = await upload(file);
				onUploaded?.(option);
				setUploads((current) => current.map((item, i) => (i === index ? { ...item, status: "done" } : item)));
			} catch (error) {
				failed = true;
				const message = (error as { message?: string }).message ?? "The upload failed.";
				setUploads((current) => current.map((item, i) => (i === index ? { ...item, status: "error", message } : item)));
			}
		}

		if (onUploaded == null && !failed && accepted.length > 0) {
			window.location.reload();
		}
	}

	const isUploading = uploads.some((item) => item.status === "uploading");

	return (
		<div className="flex flex-col gap-3">
			<DropZone
				onDrop={(event) => {
					void Promise.all(event.items.filter((item) => item.kind === "file").map((item) => item.getFile())).then(
						(files) => uploadAll(allowsMultiple ? files : files.slice(0, 1)),
					);
				}}
				className="flex-col gap-3 bg-muted/50 text-center"
			>
				<span className="flex items-center justify-center rounded-full bg-bg text-muted-fg shadow-xs ring ring-border block-10 inline-10">
					<Upload aria-hidden={true} className="block-5 inline-5" />
				</span>
				<Text>Drop files here, or</Text>
				<FileTrigger
					acceptedFileTypes={acceptedTypes}
					allowsMultiple={allowsMultiple}
					isPending={isUploading}
					isDisabled={isUploading}
					onSelect={(files) => {
						void uploadAll(files != null ? [...files] : []);
					}}
					size="sm"
				>
					{allowsMultiple ? "Choose files" : "Choose a file"}
				</FileTrigger>
				<Text className="text-xs/5">Images (jpeg, png, webp, avif, gif, svg) and pdfs.</Text>
			</DropZone>
			{uploads.length > 0 && (
				<ul aria-live="polite" className="flex flex-col gap-1 text-sm/6">
					{uploads.map((item, index) => (
						<li
							key={index}
							className={`flex items-center gap-2 ${item.status === "error" ? "text-danger-subtle-fg" : "text-fg"}`}
						>
							{item.status === "uploading" ? (
								<Loader aria-label="Uploading" className="text-muted-fg block-4 inline-4" />
							) : item.status === "done" ? (
								<CircleCheck aria-hidden={true} className="text-success-subtle-fg block-4 inline-4" />
							) : (
								<CircleAlert aria-hidden={true} className="block-4 inline-4" />
							)}
							<span className="truncate min-inline-0">
								{item.name}:{" "}
								{item.status === "uploading" ? "uploading…" : item.status === "done" ? "uploaded." : item.message}
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
