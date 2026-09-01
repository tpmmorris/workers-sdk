import { Button, useKumoToastManager } from "@cloudflare/kumo";
import { EnvelopeSimpleIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type JSX,
} from "react";
import { emailListRouting, localExplorerListWorkers } from "../../../api";
import {
	getRoutingEmailResendDraft,
	resendRoutingEmail,
} from "../../../api/email-resend";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import {
	getEmailResendErrorMessage,
	getEmailResendFeedback,
	toTestEmailDraft,
} from "../../../components/email/email-resend-utils";
import { EmailList } from "../../../components/email/EmailList";
import { EMAIL_PAGE_SIZE } from "../../../components/email/EmailPagination";
import { RoutingEmailRowActions } from "../../../components/email/RoutingEmailRowActions";
import { SendTestEmailDialog } from "../../../components/email/send-test-email";
import { ResourceError } from "../../../components/ResourceError";
import { getSelectedWorker } from "../../../components/WorkerSelector";
import { timeAgo } from "../../../components/workflows/helpers";
import { formatEmailAddress } from "../../../utils/format";
import { toEmailId } from "../shared/types";
import { useCursorPaginatedList } from "../shared/useCursorPaginatedList";
import type { EmailRoutingItem } from "../../../api";
import type { TestEmailDraft } from "../../../components/email/send-test-email";

export const Route = createFileRoute("/email/routing/")({
	component: EmailRoutingView,
	errorComponent: ResourceError,
	loaderDeps: ({ search }) => ({ worker: search.worker }),
	loader: async ({ deps }) => {
		const workersResponse = await localExplorerListWorkers();
		const worker = getSelectedWorker(
			workersResponse.data?.result ?? [],
			deps.worker === undefined
				? ""
				: `?worker=${encodeURIComponent(deps.worker)}`
		)?.name;
		const response = await emailListRouting({
			query: { per_page: EMAIL_PAGE_SIZE, worker },
		});
		const emails = response.data?.result;
		return {
			emails: Array.isArray(emails) ? emails : [],
			worker,
			nextCursor: response.data?.result_info?.has_more
				? response.data.result_info.cursor
				: undefined,
		};
	},
});

function EmailRoutingView(): JSX.Element {
	const loaderData = Route.useLoaderData();
	const navigate = Route.useNavigate();
	const toast = useKumoToastManager();
	const { worker } = loaderData;
	const [dialogOpen, setDialogOpen] = useState<boolean>(false);
	const [dialogDraft, setDialogDraft] = useState<TestEmailDraft>();
	const [dialogIncompleteSource, setDialogIncompleteSource] =
		useState<boolean>(false);
	const [dialogWorker, setDialogWorker] = useState<string>();
	const [editingKey, setEditingKey] = useState<string>();
	const [resendingKeys, setResendingKeys] = useState<ReadonlySet<string>>(
		new Set()
	);
	const editRequest = useRef<number>(0);
	const editAbortController = useRef<AbortController | undefined>(undefined);
	const resendingKeysRef = useRef<Set<string>>(new Set());

	const fetchEmails = useCallback(
		async (cursor?: string) => {
			const response = await emailListRouting({
				query: { cursor, per_page: EMAIL_PAGE_SIZE, worker },
			});
			const result = response.data?.result;
			return {
				items: Array.isArray(result) ? result : [],
				nextCursor: response.data?.result_info?.has_more
					? response.data.result_info.cursor
					: undefined,
			};
		},
		[worker]
	);
	const initialPage = useMemo(
		() => ({ items: loaderData.emails, nextCursor: loaderData.nextCursor }),
		[loaderData]
	);
	const {
		error: refreshError,
		hasNext,
		hasPrevious,
		items: emails,
		nextPage,
		paging,
		previousPage,
		refresh,
		refreshing,
	} = useCursorPaginatedList<EmailRoutingItem>({
		fetchPage: fetchEmails,
		initialPage,
		pageErrorMessages: {
			next: "Failed to load the next page.",
			previous: "Failed to load the previous page.",
			refresh: "Failed to refresh received emails.",
		},
	});

	useEffect(() => {
		editRequest.current += 1;
		editAbortController.current?.abort();
		editAbortController.current = undefined;
		setEditingKey(undefined);
		setDialogOpen(false);
		return () => {
			editRequest.current += 1;
			editAbortController.current?.abort();
		};
	}, [worker]);

	function getEmailWorker(email: EmailRoutingItem): string | undefined {
		return email.worker ?? worker;
	}

	function getEmailKey(email: EmailRoutingItem): string {
		return `${getEmailWorker(email) ?? ""}\0${email.messageId}`;
	}

	function openBlankComposer(): void {
		editRequest.current += 1;
		editAbortController.current?.abort();
		editAbortController.current = undefined;
		setEditingKey(undefined);
		setDialogDraft(undefined);
		setDialogIncompleteSource(false);
		setDialogWorker(worker);
		setDialogOpen(true);
	}

	async function editAndResend(email: EmailRoutingItem): Promise<void> {
		if (!email.editAndResendAvailable) {
			return;
		}
		const sourceWorker = getEmailWorker(email);
		if (!sourceWorker) {
			toast.add({
				title: "The source Worker is unavailable.",
				variant: "error",
			});
			return;
		}

		const requestId = editRequest.current + 1;
		editRequest.current = requestId;
		editAbortController.current?.abort();
		const controller = new AbortController();
		editAbortController.current = controller;
		const emailKey = getEmailKey(email);
		setEditingKey(emailKey);

		try {
			const { data, error, response } = await getRoutingEmailResendDraft({
				messageId: email.messageId,
				signal: controller.signal,
				worker: sourceWorker,
			});
			if (requestId !== editRequest.current) {
				return;
			}
			const result = data?.result;
			if (error || !response.ok || !result) {
				toast.add({
					title: getEmailResendErrorMessage(
						error,
						"Failed to load this email into the composer."
					),
					variant: "error",
				});
				return;
			}
			setDialogDraft(toTestEmailDraft(result.draft));
			setDialogIncompleteSource(result.capturedPortion);
			setDialogWorker(sourceWorker);
			setDialogOpen(true);
		} catch (error) {
			if (
				requestId === editRequest.current &&
				!(error instanceof DOMException && error.name === "AbortError")
			) {
				toast.add({
					title: getEmailResendErrorMessage(
						error,
						"Failed to load this email into the composer."
					),
					variant: "error",
				});
			}
		} finally {
			if (requestId === editRequest.current) {
				editAbortController.current = undefined;
				setEditingKey(undefined);
			}
		}
	}

	async function resend(email: EmailRoutingItem): Promise<void> {
		const sourceWorker = getEmailWorker(email);
		if (!sourceWorker) {
			toast.add({
				title: "The source Worker is unavailable.",
				variant: "error",
			});
			return;
		}
		const emailKey = getEmailKey(email);
		if (resendingKeysRef.current.has(emailKey)) {
			return;
		}
		resendingKeysRef.current.add(emailKey);
		setResendingKeys(new Set(resendingKeysRef.current));

		try {
			const { data, error, response } = await resendRoutingEmail({
				messageId: email.messageId,
				worker: sourceWorker,
			});
			const result = data?.result;
			if (error || !response.ok || !result) {
				toast.add({
					title: getEmailResendErrorMessage(
						error,
						"Failed to resend this email."
					),
					variant: "error",
				});
				return;
			}
			toast.add(getEmailResendFeedback(result));
		} catch (error) {
			toast.add({
				title: getEmailResendErrorMessage(
					error,
					"Failed to resend this email."
				),
				variant: "error",
			});
		} finally {
			resendingKeysRef.current.delete(emailKey);
			setResendingKeys(new Set(resendingKeysRef.current));
			await refresh();
		}
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<Breadcrumbs
				icon={EnvelopeSimpleIcon}
				items={[<span key="routing">Routing</span>]}
				title="Email"
			/>

			<div className="flex min-h-0 w-full flex-1 overflow-hidden border-y border-kumo-fill bg-kumo-base">
				<EmailList
					actions={
						<Button
							onClick={(event) => {
								event.currentTarget.blur();
								openBlankComposer();
							}}
							variant="primary"
						>
							<PaperPlaneTiltIcon size={14} weight="fill" />
							Send Test Email
						</Button>
					}
					className="flex-1"
					disabled={paging || refreshing}
					emptyState={
						<>
							No emails received yet. Use &ldquo;Send Test Email&rdquo; to
							deliver one. Email capture only works when the selected Worker has
							an email() handler configured.
						</>
					}
					error={refreshError}
					getRow={(email) => ({
						id: toEmailId(email.messageId),
						primary: email.subject || "(no subject)",
						secondary: `${formatEmailAddress(email.from)} → ${formatEmailAddress(email.to)}`,
						secondaryTitle: `From: ${formatEmailAddress(email.from)}; To: ${formatEmailAddress(email.to)}`,
						timestamp: timeAgo(email.receivedAt) || "—",
						warning:
							email.outcome === "exception"
								? "Email processing exception"
								: undefined,
						warnings: email.capturedPortion
							? ["Only the captured portion is available for edit or resend."]
							: undefined,
					})}
					hasNext={hasNext}
					hasPrevious={hasPrevious}
					items={emails}
					onNext={() => void nextPage()}
					onPrevious={() => void previousPage()}
					onRefresh={() => void refresh()}
					onRowClick={(emailId) => {
						void navigate({
							params: { emailId },
							search: (previous) => previous,
							to: "/email/routing/$emailId",
						});
					}}
					refreshing={refreshing}
					renderRowActions={(email) => {
						const emailKey = getEmailKey(email);
						return (
							<RoutingEmailRowActions
								editAvailable={email.editAndResendAvailable}
								editUnavailableReason={email.editAndResendUnavailableReason}
								editing={editingKey === emailKey}
								onEdit={() => void editAndResend(email)}
								onResend={() => void resend(email)}
								resending={resendingKeys.has(emailKey)}
							/>
						);
					}}
				/>
			</div>

			<SendTestEmailDialog
				incompleteSource={dialogIncompleteSource}
				initialDraft={dialogDraft}
				onOpenChange={setDialogOpen}
				onSendSuccess={() => {
					void refresh();
				}}
				open={dialogOpen}
				worker={dialogWorker ?? worker}
			/>
		</div>
	);
}
