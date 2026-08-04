import { Button, Dialog } from "@cloudflare/kumo";
import { PaperclipIcon, TrashIcon } from "@phosphor-icons/react";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ChangeEvent,
	type JSX,
} from "react";
import { emailSendRouting } from "../../api";
import { formatSize } from "../../utils/format";
import type { EmailSendRequest } from "../../api";

interface SendTestEmailDialogProps {
	onOpenChange: (open: boolean) => void;
	onSent: () => void;
	open: boolean;
	worker?: string;
}

type AttachmentInput = NonNullable<EmailSendRequest["attachments"]>[number];

interface SelectedAttachment extends AttachmentInput {
	size: number;
}

// The server caps the whole composed MIME message at 1 MiB. Attachments are
// base64-encoded in that message (~33% larger) alongside headers and bodies, so
// the raw attachment budget is kept below the 1 MiB cap with headroom to avoid
// a confusing server-side rejection after upload.
const MAX_TOTAL_ATTACHMENT_BYTES = 700 * 1024;

async function readFileAsBase64(file: File): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	// Chunked to stay clear of the argument-count limit on String.fromCharCode.
	const chunkSize = 0x8000;
	let binary = "";
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}

const inputClass =
	"focus-visible:ring-kumo-ring w-full rounded-lg border border-kumo-fill bg-kumo-base px-3 py-2.5 text-sm text-kumo-default placeholder:kumo-input-placeholder focus:border-kumo-brand focus:outline-none focus-visible:ring-2";

function parseAddressList(value: string): string[] {
	return value
		.split(/[\n,]/)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

function parseHeaders(
	value: string
): { valid: true; headers: Record<string, string> } | { valid: false } {
	const headers: Record<string, string> = {};
	for (const rawLine of value.split("\n")) {
		const line = rawLine.trim();
		if (!line) {
			continue;
		}
		const separator = line.indexOf(":");
		if (separator === -1) {
			return { valid: false };
		}
		const key = line.slice(0, separator).trim();
		const val = line.slice(separator + 1).trim();
		if (!key) {
			return { valid: false };
		}
		headers[key] = val;
	}
	return { valid: true, headers };
}

export function SendTestEmailDialog({
	onOpenChange,
	onSent,
	open,
	worker,
}: SendTestEmailDialogProps): JSX.Element {
	const [sending, setSending] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [from, setFrom] = useState<string>("");
	const [to, setTo] = useState<string>("");
	const [cc, setCc] = useState<string>("");
	const [bcc, setBcc] = useState<string>("");
	const [replyTo, setReplyTo] = useState<string>("");
	const [subject, setSubject] = useState<string>("");
	const [headers, setHeaders] = useState<string>("");
	const [headersError, setHeadersError] = useState<string | null>(null);
	const [text, setText] = useState<string>("");
	const [html, setHtml] = useState<string>("");
	const [attachments, setAttachments] = useState<SelectedAttachment[]>([]);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (error) {
			scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
		}
	}, [error]);

	const resetForm = useCallback(() => {
		setFrom("");
		setTo("");
		setCc("");
		setBcc("");
		setReplyTo("");
		setSubject("");
		setHeaders("");
		setHeadersError(null);
		setText("");
		setHtml("");
		setAttachments([]);
		setError(null);
	}, []);

	async function handleAttachmentsSelected(
		e: ChangeEvent<HTMLInputElement>
	): Promise<void> {
		const files = [...(e.target.files ?? [])];
		// Reset the input so re-selecting the same file still fires a change event.
		e.target.value = "";
		if (files.length === 0) {
			return;
		}

		try {
			const added = await Promise.all(
				files.map(async (file) => ({
					filename: file.name,
					type: file.type || "application/octet-stream",
					content: await readFileAsBase64(file),
					size: file.size,
				}))
			);

			const total = [...attachments, ...added].reduce(
				(sum, attachment) => sum + attachment.size,
				0
			);
			if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
				setError(
					`Attachments must total less than ${formatSize(MAX_TOTAL_ATTACHMENT_BYTES)}.`
				);
				return;
			}

			setError(null);
			setAttachments((current) => [...current, ...added]);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to read the selected file."
			);
		}
	}

	function handleRemoveAttachment(index: number): void {
		setAttachments((current) => current.filter((_, i) => i !== index));
	}

	function handleOpenChange(newOpen: boolean): void {
		if (!newOpen) {
			resetForm();
		}
		onOpenChange(newOpen);
	}

	async function handleSend(): Promise<void> {
		const recipients = parseAddressList(to);
		if (!from.trim()) {
			setError("A sender address is required.");
			return;
		}
		if (recipients.length === 0) {
			setError("At least one recipient is required.");
			return;
		}

		const parsedHeaders = parseHeaders(headers);
		if (!parsedHeaders.valid) {
			setHeadersError("Each header must use the format 'Key: Value'.");
			return;
		}

		const body: EmailSendRequest = {
			from: from.trim(),
			to: recipients,
			subject: subject.trim(),
		};
		const ccList = parseAddressList(cc);
		if (ccList.length > 0) {
			body.cc = ccList;
		}
		const bccList = parseAddressList(bcc);
		if (bccList.length > 0) {
			body.bcc = bccList;
		}
		if (replyTo.trim()) {
			body.replyTo = replyTo.trim();
		}
		if (text.trim()) {
			body.text = text;
		}
		if (html.trim()) {
			body.html = html;
		}
		if (Object.keys(parsedHeaders.headers).length > 0) {
			body.headers = parsedHeaders.headers;
		}
		if (attachments.length > 0) {
			body.attachments = attachments.map(
				({ size: _size, ...attachment }) => attachment
			);
		}

		setSending(true);
		setError(null);
		try {
			const { error: sendError, response } = await emailSendRouting({
				body,
				query: { worker },
				throwOnError: false,
			});
			if (sendError || !response.ok) {
				setError(
					sendError?.errors?.[0]?.message ?? "Failed to send test email."
				);
				return;
			}
			resetForm();
			onSent();
			onOpenChange(false);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to send test email."
			);
		} finally {
			setSending(false);
		}
	}

	return (
		<Dialog.Root open={open} onOpenChange={handleOpenChange}>
			<Dialog size="lg">
				<div className="border-b border-kumo-fill px-6 pt-6 pb-4">
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Title className="text-lg font-semibold text-kumo-default">
						Send test email
					</Dialog.Title>
					<p className="mt-1 text-sm text-kumo-subtle">
						Delivers a message to this worker&rsquo;s email() handler, exactly
						as an inbound email would arrive.
					</p>
				</div>

				<div
					ref={scrollContainerRef}
					className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5"
				>
					{error && (
						<div className="rounded-lg border border-kumo-danger/20 bg-kumo-danger/8 p-3 text-sm text-kumo-danger">
							{error}
						</div>
					)}

					<div>
						<label className="mb-2 block text-sm font-medium text-kumo-default">
							From
						</label>
						<input
							className={inputClass}
							onChange={(e) => setFrom(e.target.value)}
							placeholder="sender@example.com"
							type="text"
							value={from}
						/>
					</div>

					<div>
						<label className="mb-2 block text-sm font-medium text-kumo-default">
							To
						</label>
						<input
							className={inputClass}
							onChange={(e) => setTo(e.target.value)}
							placeholder="recipient@example.com, another@example.com"
							type="text"
							value={to}
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="mb-2 block text-sm font-medium text-kumo-default">
								Cc{" "}
								<span className="font-normal text-kumo-subtle">(optional)</span>
							</label>
							<input
								className={inputClass}
								onChange={(e) => setCc(e.target.value)}
								placeholder="cc@example.com"
								type="text"
								value={cc}
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-kumo-default">
								Bcc{" "}
								<span className="font-normal text-kumo-subtle">(optional)</span>
							</label>
							<input
								className={inputClass}
								onChange={(e) => setBcc(e.target.value)}
								placeholder="bcc@example.com"
								type="text"
								value={bcc}
							/>
						</div>
					</div>

					<div>
						<label className="mb-2 block text-sm font-medium text-kumo-default">
							Reply-To{" "}
							<span className="font-normal text-kumo-subtle">(optional)</span>
						</label>
						<input
							className={inputClass}
							onChange={(e) => setReplyTo(e.target.value)}
							placeholder="reply@example.com"
							type="text"
							value={replyTo}
						/>
					</div>

					<div>
						<label className="mb-2 block text-sm font-medium text-kumo-default">
							Subject
						</label>
						<input
							className={inputClass}
							onChange={(e) => setSubject(e.target.value)}
							placeholder="Hello from the local explorer"
							type="text"
							value={subject}
						/>
					</div>

					<div>
						<label className="mb-2 block text-sm font-medium text-kumo-default">
							Custom headers{" "}
							<span className="font-normal text-kumo-subtle">(optional)</span>
						</label>
						<textarea
							className={`${inputClass} resize-y font-mono ${
								headersError
									? "border-kumo-danger focus:border-kumo-danger"
									: ""
							}`}
							onChange={(e) => {
								setHeaders(e.target.value);
								if (headersError) {
									setHeadersError(null);
								}
							}}
							placeholder={"X-Custom-Header: value\nX-Another: value"}
							rows={3}
							value={headers}
						/>
						{headersError ? (
							<p className="mt-1 text-xs text-kumo-danger">{headersError}</p>
						) : (
							<p className="mt-1 text-xs text-kumo-subtle">
								One header per line, formatted as &lsquo;Key: Value&rsquo;
							</p>
						)}
					</div>

					<div>
						<label className="mb-2 block text-sm font-medium text-kumo-default">
							Text body{" "}
							<span className="font-normal text-kumo-subtle">(optional)</span>
						</label>
						<textarea
							className={`${inputClass} resize-y`}
							onChange={(e) => setText(e.target.value)}
							placeholder="Plain text body"
							rows={4}
							value={text}
						/>
					</div>

					<div>
						<label className="mb-2 block text-sm font-medium text-kumo-default">
							HTML body{" "}
							<span className="font-normal text-kumo-subtle">(optional)</span>
						</label>
						<textarea
							className={`${inputClass} resize-y font-mono`}
							onChange={(e) => setHtml(e.target.value)}
							placeholder="<p>HTML body</p>"
							rows={4}
							value={html}
						/>
					</div>

					<div>
						<div className="mb-2 flex items-center justify-between">
							<label className="text-sm font-medium text-kumo-default">
								Attachments{" "}
								<span className="font-normal text-kumo-subtle">(optional)</span>
							</label>
							<Button
								variant="ghost"
								onClick={() => fileInputRef.current?.click()}
							>
								<PaperclipIcon size={12} />
								Add files
							</Button>
						</div>

						<input
							className="hidden"
							multiple
							onChange={(e) => void handleAttachmentsSelected(e)}
							ref={fileInputRef}
							type="file"
						/>

						{attachments.length === 0 ? (
							<p className="text-sm text-kumo-subtle italic">No attachments</p>
						) : (
							<div className="space-y-2">
								{attachments.map((attachment, index) => (
									<div
										key={`${attachment.filename}-${index}`}
										className="flex items-center gap-2 rounded-lg border border-kumo-fill bg-kumo-base px-3 py-2"
									>
										<PaperclipIcon
											size={14}
											className="shrink-0 text-kumo-subtle"
										/>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm text-kumo-default">
												{attachment.filename}
											</p>
											<p className="text-xs text-kumo-subtle">
												{attachment.type} &middot; {formatSize(attachment.size)}
											</p>
										</div>
										<Button
											variant="ghost"
											shape="square"
											onClick={() => handleRemoveAttachment(index)}
											aria-label={`Remove ${attachment.filename}`}
										>
											<TrashIcon size={14} />
										</Button>
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				<div className="flex justify-end gap-2 border-t border-kumo-fill px-6 py-4">
					<Button
						variant="secondary"
						onClick={() => handleOpenChange(false)}
						disabled={sending}
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						disabled={sending}
						loading={sending}
						onClick={() => void handleSend()}
					>
						{sending ? "Sending..." : "Send Email"}
					</Button>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
