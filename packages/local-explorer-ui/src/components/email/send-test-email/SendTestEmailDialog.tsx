import { Button, Dialog, useKumoToastManager } from "@cloudflare/kumo";
import { useCallback, type JSX } from "react";
import { AddressFields } from "./AddressFields";
import { AttachmentsSection } from "./AttachmentsSection";
import { BodyFields } from "./BodyFields";
import { CustomHeadersSection } from "./CustomHeadersSection";
import { useSendTestEmailComposer } from "./useSendTestEmailComposer";
import type { TestEmailDraft } from "./types";

export interface SendTestEmailDialogProps {
	initialDraft?: TestEmailDraft;
	onOpenChange: (open: boolean) => void;
	onSent: (draft: TestEmailDraft) => void;
	open: boolean;
	worker?: string;
}

/** Renders the mounted shell for structured test-email composition. */
export function SendTestEmailDialog({
	initialDraft,
	onOpenChange,
	onSent,
	open,
	worker,
}: SendTestEmailDialogProps): JSX.Element {
	const toast = useKumoToastManager();
	const onError = useCallback(
		(message: string) => {
			toast.add({ title: message, variant: "error" });
		},
		[toast]
	);
	const composer = useSendTestEmailComposer({
		initialDraft,
		onError,
		onOpenChange,
		onSent,
		open,
		worker,
	});
	const { state } = composer;

	return (
		<Dialog.Root open={open} onOpenChange={composer.openState.change}>
			<Dialog
				className="w-[calc(100vw-2rem)] max-w-[32rem] min-w-0 sm:w-[32rem] sm:max-w-[32rem]"
				size="lg"
			>
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

				<form
					className="min-w-0"
					noValidate
					onSubmit={(event) => {
						event.preventDefault();
						void composer.submission.submit();
					}}
				>
					<div className="max-h-[60vh] min-w-0 space-y-4 overflow-y-auto px-6 py-5">
						<AddressFields
							errors={{
								fromError: state.fromError,
								toError: state.toError,
							}}
							onChange={composer.fields.change}
							values={{
								bcc: state.bcc,
								cc: state.cc,
								from: state.from,
								replyTo: state.replyTo,
								subject: state.subject,
								to: state.to,
							}}
						/>
						<CustomHeadersSection
							headers={state.headers}
							onAdd={composer.headers.add}
							onChange={composer.headers.change}
							onRemove={composer.headers.remove}
						/>
						<BodyFields
							html={state.html}
							onHtmlChange={(value) => composer.fields.change("html", value)}
							onTextChange={(value) => composer.fields.change("text", value)}
							text={state.text}
						/>
						<AttachmentsSection
							attachments={state.attachments}
							error={state.attachmentsError}
							onFilesSelected={(files) => {
								void composer.attachments.addFiles(files);
							}}
							onRemove={composer.attachments.remove}
						/>
					</div>

					<div className="flex justify-end gap-2 border-t border-kumo-fill px-6 py-4">
						<Button
							type="button"
							variant="secondary"
							onClick={() => composer.openState.change(false)}
							disabled={state.sending}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							variant="primary"
							disabled={state.sending || state.pendingAttachmentReads > 0}
							loading={state.sending}
						>
							{state.sending ? "Sending..." : "Send Email"}
						</Button>
					</div>
				</form>
			</Dialog>
		</Dialog.Root>
	);
}
