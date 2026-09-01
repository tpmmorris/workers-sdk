import { Button } from "@cloudflare/kumo";
import { FileArrowUpIcon, FileTextIcon } from "@phosphor-icons/react";
import { useRef, useState, type DragEvent, type JSX } from "react";
import { formatSize } from "../../../utils/format";

interface RawEmailFileSectionProps {
	error: string | null;
	file: File | null;
	onFilesSelected: (files: File[]) => void;
	onRemove: () => void;
}

/** Renders raw `.eml` selection and the mutually exclusive selected-file row. */
export function RawEmailFileSection({
	error,
	file,
	onFilesSelected,
	onRemove,
}: RawEmailFileSectionProps): JSX.Element {
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState<boolean>(false);

	function handleDragOver(event: DragEvent<HTMLButtonElement>): void {
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
		setDragging(true);
	}

	function handleDragLeave(event: DragEvent<HTMLButtonElement>): void {
		if (
			event.relatedTarget instanceof Node &&
			event.currentTarget.contains(event.relatedTarget)
		) {
			return;
		}
		setDragging(false);
	}

	if (file) {
		return (
			<div>
				<div className="flex items-start gap-2 rounded-lg bg-kumo-elevated px-3 py-2 ring ring-kumo-line">
					<span className="flex h-lh shrink-0 items-center">
						<FileTextIcon className="text-kumo-subtle" size={14} />
					</span>
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm text-kumo-default">{file.name}</p>
						<p className="text-sm text-kumo-subtle">{formatSize(file.size)}</p>
					</div>
					<Button type="button" variant="ghost" onClick={onRemove}>
						Remove
					</Button>
				</div>
				{error && (
					<p
						className="mt-2 text-sm leading-snug text-kumo-danger"
						id="test-email-raw-file-error"
						role="alert"
					>
						{error}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<input
				accept=".eml,message/rfc822"
				aria-label="Upload .eml file"
				className="sr-only"
				id="test-email-raw-file"
				onChange={(event) => {
					const files = [...(event.target.files ?? [])];
					event.target.value = "";
					onFilesSelected(files);
				}}
				ref={inputRef}
				tabIndex={-1}
				type="file"
			/>
			<button
				aria-describedby={error ? "test-email-raw-file-error" : undefined}
				aria-invalid={error ? true : undefined}
				className={`focus-visible:ring-kumo-ring flex w-full flex-col items-center justify-center gap-1 rounded-lg bg-kumo-elevated px-5 py-4 text-center text-sm text-kumo-default outline-none hover:bg-kumo-fill focus-visible:ring-2 ${
					error
						? "ring-2 ring-kumo-danger"
						: dragging
							? "ring-2 ring-kumo-brand"
							: "ring ring-kumo-line"
				}`}
				onClick={() => inputRef.current?.click()}
				onDragEnter={handleDragOver}
				onDragLeave={handleDragLeave}
				onDragOver={handleDragOver}
				onDrop={(event) => {
					event.preventDefault();
					setDragging(false);
					onFilesSelected([...event.dataTransfer.files]);
				}}
				type="button"
			>
				<span className="flex h-lh items-center">
					<FileArrowUpIcon aria-hidden="true" size={14} />
				</span>
				<span className="font-medium">Upload an .eml file</span>
				<span className="text-kumo-subtle">Drag and drop or choose a file</span>
			</button>
			{error && (
				<p
					className="text-sm leading-snug text-kumo-danger"
					id="test-email-raw-file-error"
					role="alert"
				>
					{error}
				</p>
			)}
			<div className="flex items-center gap-3" aria-hidden="true">
				<div className="h-px flex-1 bg-kumo-fill" />
				<span className="text-sm text-kumo-subtle">or compose manually</span>
				<div className="h-px flex-1 bg-kumo-fill" />
			</div>
		</div>
	);
}
