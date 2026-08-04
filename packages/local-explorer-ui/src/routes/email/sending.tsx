import { Button, Dialog } from "@cloudflare/kumo";
import { ArrowsClockwiseIcon, PaperclipIcon } from "@phosphor-icons/react";
import {
	createFileRoute,
	getRouteApi,
	useRouterState,
} from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { emailGetSending, emailListSending } from "../../api";
import EmailIcon from "../../assets/icons/email.svg?react";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { EmailServiceEmptyState } from "../../components/email/EmailServiceEmptyState";
import { ResourceError } from "../../components/ResourceError";
import { getSelectedWorker } from "../../components/WorkerSelector";
import { timeAgo } from "../../components/workflows/helpers";
import { withMinimumDelay } from "../../utils/async";
import { toEmailId } from "./shared/types";
import type { EmailSendingDetail, EmailSendingItem } from "../../api";

export const Route = createFileRoute("/email/sending")({
	component: EmailSendingView,
	errorComponent: ResourceError,
	loaderDeps: ({ search }) => ({ worker: search.worker }),
	loader: async ({ deps }) => {
		const response = await emailListSending({
			query: { worker: deps.worker },
		});
		return { emails: response.data?.result ?? [] };
	},
	validateSearch: (search: Record<string, unknown>): { worker?: string } => ({
		worker: typeof search.worker === "string" ? search.worker : undefined,
	}),
});

const rootRoute = getRouteApi("__root__");

function MetaRow({
	label,
	value,
}: {
	label: string;
	value: string;
}): JSX.Element {
	return (
		<div className="grid grid-cols-[120px_1fr] gap-3 py-1.5">
			<span className="text-sm text-kumo-subtle">{label}</span>
			<span className="text-sm break-all text-kumo-default">{value}</span>
		</div>
	);
}

function SentEmailDialog({
	email,
	onOpenChange,
}: {
	email: EmailSendingDetail | null;
	onOpenChange: (open: boolean) => void;
}): JSX.Element {
	return (
		<Dialog.Root open={email !== null} onOpenChange={onOpenChange}>
			<Dialog size="lg">
				<div className="border-b border-kumo-fill px-6 pt-6 pb-4">
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Title className="text-lg font-semibold text-kumo-default">
						{email?.subject || "(no subject)"}
					</Dialog.Title>
				</div>

				{email && (
					<div className="max-h-[60vh] space-y-6 overflow-y-auto px-6 py-5">
						<div className="rounded-lg border border-kumo-fill bg-kumo-base px-5 py-4">
							<MetaRow label="From" value={email.from} />
							<MetaRow label="To" value={email.to.join(", ")} />
							{email.cc?.length ? (
								<MetaRow label="Cc" value={email.cc.join(", ")} />
							) : null}
							{email.bcc?.length ? (
								<MetaRow label="Bcc" value={email.bcc.join(", ")} />
							) : null}
							{email.replyTo && (
								<MetaRow label="Reply-To" value={email.replyTo} />
							)}
							{email.messageId && (
								<MetaRow label="Message-ID" value={email.messageId} />
							)}
							<MetaRow
								label="Sent"
								value={new Date(email.sentAt).toLocaleString()}
							/>
						</div>

						{email.attachments.length > 0 && (
							<div>
								<h2 className="mb-2 text-sm font-semibold text-kumo-default">
									Attachments
								</h2>
								<div className="overflow-hidden rounded-lg border border-kumo-fill bg-kumo-base">
									{email.attachments.map((attachment, index) => (
										<div
											className="flex items-center gap-2 border-b border-kumo-fill px-4 py-2.5 last:border-b-0"
											key={index}
										>
											<PaperclipIcon className="text-kumo-subtle" size={14} />
											<span className="text-sm text-kumo-default">
												{attachment.filename}
											</span>
											<span className="text-xs text-kumo-subtle">
												{attachment.contentType}
											</span>
											<span className="ml-auto text-xs text-kumo-subtle">
												{attachment.size} bytes
											</span>
										</div>
									))}
								</div>
							</div>
						)}

						{email.text && (
							<div>
								<h2 className="mb-2 text-sm font-semibold text-kumo-default">
									Text body
								</h2>
								<pre className="max-h-64 overflow-auto rounded-lg border border-kumo-fill bg-kumo-elevated p-4 text-xs whitespace-pre-wrap text-kumo-default">
									{email.text}
								</pre>
							</div>
						)}

						{email.html && (
							<div>
								<h2 className="mb-2 text-sm font-semibold text-kumo-default">
									HTML body
								</h2>
								<pre className="max-h-64 overflow-auto rounded-lg border border-kumo-fill bg-kumo-elevated p-4 font-mono text-xs whitespace-pre-wrap text-kumo-default">
									{email.html}
								</pre>
							</div>
						)}

						{email.raw && (
							<div>
								<h2 className="mb-2 text-sm font-semibold text-kumo-default">
									Raw message
								</h2>
								<pre className="max-h-64 overflow-auto rounded-lg border border-kumo-fill bg-kumo-elevated p-4 font-mono text-xs whitespace-pre-wrap text-kumo-default">
									{email.raw}
								</pre>
							</div>
						)}
					</div>
				)}

				<div className="flex justify-end border-t border-kumo-fill px-6 py-4">
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}

function EmailSendingView(): JSX.Element {
	const loaderData = Route.useLoaderData();
	const rootData = rootRoute.useLoaderData();
	const routerState = useRouterState();
	const { worker } = Route.useSearch();

	const [emails, setEmails] = useState<EmailSendingItem[]>(loaderData.emails);
	const [refreshing, setRefreshing] = useState<boolean>(false);
	const [selected, setSelected] = useState<EmailSendingDetail | null>(null);
	const [error, setError] = useState<string | null>(null);

	// The "Sending" view requires at least one send_email binding on the
	// selected worker. Without one, there is no sending service to show.
	const hasSendingService = useMemo(() => {
		const selectedWorker = getSelectedWorker(
			rootData.workers,
			routerState.location.searchStr
		);
		return (selectedWorker?.bindings?.sendEmail?.length ?? 0) > 0;
	}, [rootData.workers, routerState.location.searchStr]);

	useEffect(() => {
		setEmails(loaderData.emails);
	}, [loaderData]);

	const fetchEmails = useCallback(async (): Promise<void> => {
		const response = await emailListSending({ query: { worker } });
		setEmails(response.data?.result ?? []);
	}, [worker]);

	const handleRefresh = useCallback(async () => {
		setRefreshing(true);
		setError(null);
		try {
			await withMinimumDelay(fetchEmails());
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Failed to refresh sent emails."
			);
		} finally {
			setRefreshing(false);
		}
	}, [fetchEmails]);

	async function handleRowClick(emailId: string): Promise<void> {
		setError(null);
		try {
			const response = await emailGetSending({
				path: { email_id: emailId },
				query: { worker },
			});
			if (response.data?.result) {
				setSelected(response.data.result);
			}
		} catch (e) {
			// Surface the failure instead of silently dropping the click.
			setError(
				e instanceof Error ? e.message : "Failed to load the sent email."
			);
		}
	}

	if (!hasSendingService) {
		return (
			<>
				<Breadcrumbs
					icon={EmailIcon}
					items={[<span key="sending">Sending</span>]}
					title="Email"
				/>
				<EmailServiceEmptyState
					title="No Sending Service"
					description="This worker has no Send Email bindings configured. Add a send_email binding to your Wrangler configuration to send emails from this worker."
				/>
			</>
		);
	}

	return (
		<>
			<Breadcrumbs
				icon={EmailIcon}
				items={[<span key="sending">Sending</span>]}
				title="Email"
			/>

			<div className="px-8 py-6">
				<div className="mb-4 flex items-center justify-between">
					<Button
						aria-label="Refresh"
						disabled={refreshing}
						onClick={() => void handleRefresh()}
						shape="square"
						variant="secondary"
					>
						<ArrowsClockwiseIcon
							size={18}
							className={refreshing ? "animate-spin" : ""}
						/>
					</Button>
				</div>

				{error && (
					<div
						className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
						role="alert"
					>
						{error}
					</div>
				)}

				{emails.length === 0 ? (
					<div className="rounded-lg border border-kumo-fill bg-kumo-elevated px-5 py-8 text-center text-sm text-kumo-subtle">
						No emails sent yet. Messages sent via a send_email binding will
						appear here.
					</div>
				) : (
					<div className="overflow-hidden rounded-lg border border-kumo-fill bg-kumo-base">
						{emails.map((email) => (
							<div
								className="grid h-12 cursor-pointer grid-cols-[1fr_1fr_2fr_auto] items-center gap-3 border-b border-kumo-fill px-4 transition-colors last:border-b-0 hover:bg-kumo-fill"
								key={email.messageId}
								onClick={() => void handleRowClick(toEmailId(email.messageId))}
							>
								<span className="truncate text-sm text-kumo-default">
									{email.from}
								</span>
								<span className="truncate text-sm text-kumo-subtle">
									{email.to.join(", ")}
								</span>
								<span className="truncate text-sm text-kumo-default">
									{email.subject || "(no subject)"}
								</span>
								<span className="text-right text-xs text-kumo-subtle">
									{timeAgo(email.sentAt) || "—"}
								</span>
							</div>
						))}
					</div>
				)}
			</div>

			<SentEmailDialog
				email={selected}
				onOpenChange={(open) => {
					if (!open) {
						setSelected(null);
					}
				}}
			/>
		</>
	);
}
