import { Button } from "@cloudflare/kumo";
import { ArrowsClockwiseIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type JSX } from "react";
import { emailListRouting } from "../../../api";
import EmailIcon from "../../../assets/icons/email.svg?react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { SendTestEmailDialog } from "../../../components/email/SendTestEmailDialog";
import { ResourceError } from "../../../components/ResourceError";
import { timeAgo } from "../../../components/workflows/helpers";
import { withMinimumDelay } from "../../../utils/async";
import { toEmailId } from "../shared/types";
import type { EmailRoutingItem } from "../../../api";

export const Route = createFileRoute("/email/routing/")({
	component: EmailRoutingView,
	errorComponent: ResourceError,
	loader: async () => {
		const response = await emailListRouting();
		return { emails: response.data?.result ?? [] };
	},
});

function EmailRoutingView(): JSX.Element {
	const loaderData = Route.useLoaderData();
	const navigate = useNavigate();

	const [emails, setEmails] = useState<EmailRoutingItem[]>(loaderData.emails);
	const [dialogOpen, setDialogOpen] = useState<boolean>(false);
	const [refreshing, setRefreshing] = useState<boolean>(false);
	const [refreshError, setRefreshError] = useState<string | null>(null);

	useEffect(() => {
		setEmails(loaderData.emails);
	}, [loaderData]);

	const fetchEmails = useCallback(async (): Promise<void> => {
		const response = await emailListRouting();
		setEmails(response.data?.result ?? []);
	}, []);

	const handleRefresh = useCallback(async () => {
		setRefreshing(true);
		setRefreshError(null);
		try {
			await withMinimumDelay(fetchEmails());
		} catch (e) {
			// Keep the existing rows and surface the failure rather than leaving an
			// unhandled rejection or silently doing nothing.
			setRefreshError(
				e instanceof Error ? e.message : "Failed to refresh received emails."
			);
		} finally {
			setRefreshing(false);
		}
	}, [fetchEmails]);

	function handleRowClick(emailId: string): void {
		void navigate({
			to: "/email/routing/$emailId",
			params: { emailId },
			search: (prev) => prev,
		});
	}

	return (
		<>
			<Breadcrumbs
				icon={EmailIcon}
				items={[<span key="routing">Routing</span>]}
				title="Email"
			/>

			<div className="px-8 py-6">
				<div className="mb-4 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Button
							onClick={(e) => {
								(e.target as HTMLButtonElement).blur();
								setDialogOpen(true);
							}}
							variant="primary"
						>
							<PaperPlaneTiltIcon size={14} weight="fill" />
							Send Test Email
						</Button>
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
				</div>

				{refreshError && (
					<div
						className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
						role="alert"
					>
						{refreshError}
					</div>
				)}

				{emails.length === 0 ? (
					<div className="rounded-lg border border-kumo-fill bg-kumo-elevated px-5 py-8 text-center text-sm text-kumo-subtle">
						No emails received yet. Use &ldquo;Send Test Email&rdquo; to deliver
						one to the email() handler.
					</div>
				) : (
					<div className="overflow-hidden rounded-lg border border-kumo-fill bg-kumo-base">
						{emails.map((email) => (
							<div
								className="grid h-12 cursor-pointer grid-cols-[1fr_1fr_2fr_auto] items-center gap-3 border-b border-kumo-fill px-4 transition-colors last:border-b-0 hover:bg-kumo-fill"
								key={email.messageId}
								onClick={() => {
									handleRowClick(toEmailId(email.messageId));
								}}
							>
								<span className="truncate text-sm text-kumo-default">
									{email.from}
								</span>
								<span className="truncate text-sm text-kumo-subtle">
									{email.to}
								</span>
								<span className="truncate text-sm text-kumo-default">
									{email.subject || "(no subject)"}
								</span>
								<span className="text-right text-xs text-kumo-subtle">
									{timeAgo(email.receivedAt) || "—"}
								</span>
							</div>
						))}
					</div>
				)}
			</div>

			<SendTestEmailDialog
				onOpenChange={setDialogOpen}
				onSent={() => void handleRefresh()}
				open={dialogOpen}
			/>
		</>
	);
}
