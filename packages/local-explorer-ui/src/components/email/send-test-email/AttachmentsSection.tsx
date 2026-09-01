import { Button } from "@cloudflare/kumo";
import { PaperclipIcon, TrashIcon } from "@phosphor-icons/react";
import { useRef, type JSX } from "react";
import { formatSize } from "../../../utils/format";
import type { SelectedTestEmailAttachment } from "./types";

interface AttachmentsSectionProps {
	attachments: SelectedTestEmailAttachment[];
	error: string | null;
	onFilesSelected: (files: File[]) => void;
	onRemove: (index: number) => void;
}

/** Renders structured-email attachment selection and file rows. */
export function AttachmentsSection({
	attachments,
	error,
	onFilesSelected,
	onRemove,
}: AttachmentsSectionProps): JSX.Element {
	const fileInputRef = useRef<HTMLInputElement>(null);

	return (
		<div>
			<div className="mb-2 flex items-center justify-between">
				<label
					className="text-sm font-medium text-kumo-default"
					htmlFor="test-email-attachments"
				>
					Attachments
				</label>
				<Button
					aria-describedby={error ? "test-email-attachments-error" : undefined}
					className={error ? "ring-2 ring-kumo-danger" : undefined}
					type="button"
					variant="ghost"
					onClick={() => fileInputRef.current?.click()}
				>
					<PaperclipIcon size={14} />
					Add files
				</Button>
			</div>

			<input
				aria-describedby={error ? "test-email-attachments-error" : undefined}
				aria-invalid={error ? true : undefined}
				className="hidden"
				id="test-email-attachments"
				multiple
				onChange={(event) => {
					const files = [...(event.target.files ?? [])];
					// Allow selecting the same file again after this event.
					event.target.value = "";
					onFilesSelected(files);
				}}
				ref={fileInputRef}
				type="file"
			/>
			{error && (
				<p
					className="mb-2 text-sm leading-snug text-kumo-danger"
					id="test-email-attachments-error"
					role="alert"
				>
					{error}
				</p>
			)}

			{attachments.length === 0 ? (
				<p className="text-sm text-kumo-subtle italic">No attachments</p>
			) : (
				<div className="space-y-2">
					{attachments.map((attachment, index) => (
						<div
							key={`${attachment.filename}-${index}`}
							className="flex items-start gap-2 rounded-lg border border-kumo-fill bg-kumo-base px-3 py-2"
						>
							<span className="flex h-lh shrink-0 items-center">
								<PaperclipIcon className="text-kumo-subtle" size={14} />
							</span>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm text-kumo-default">
									{attachment.filename}
								</p>
								<p className="text-sm text-kumo-subtle">
									{attachment.type} &middot; {formatSize(attachment.size)}
								</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								shape="square"
								onClick={() => onRemove(index)}
								aria-label={`Remove ${attachment.filename}`}
							>
								<TrashIcon size={14} />
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
