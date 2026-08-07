import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { emailGetRouting } from "../../../api";
import EmailIcon from "../../../assets/icons/email.svg?react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { NotFound } from "../../../components/NotFound";
import { ResourceError } from "../../../components/ResourceError";
import { ConstantsCard } from "../shared/ConstantsCard";
import { InfoFlow } from "../shared/InfoFlow";
import { InfoLoading } from "../shared/InfoLoading";
import { toEmailId } from "../shared/types";
import type { EmailRoutingDetail } from "../../../api";
import type { InfoEvent, InfoMessage } from "../shared/types";
import type { JSX } from "react";

export const Route = createFileRoute("/email/routing/$emailId")({
	component: EmailRoutingDetailView,
	errorComponent: ResourceError,
	notFoundComponent: NotFound,
	pendingComponent: InfoLoading,
	loader: async ({ params }) => {
		const response = await emailGetRouting({
			path: { email_id: params.emailId },
			throwOnError: false,
		});
		if (response.response?.status === 404) {
			throw notFound();
		}
		if (response.error || !response.data?.result) {
			throw new Error(`Failed to load email "${params.emailId}"`);
		}
		return { email: response.data.result };
	},
});

function toInfoMessage(email: EmailRoutingDetail): InfoMessage {
	const emailId = toEmailId(email.messageId);
	const events: InfoEvent[] = email.events.map((event, index) => ({
		id: `${emailId}-${index}`,
		type: event.type,
		timestamp: event.timestamp,
		// `forward`/`reply` events carry a messageId correlating with the full
		// payload; `reject` events carry the message-level reject reason.
		forward:
			event.type === "forward"
				? email.forwards.find((f) => f.messageId === event.messageId)
				: undefined,
		reply:
			event.type === "reply"
				? email.replies.find((r) => r.messageId === event.messageId)
				: undefined,
		rejectReason: event.type === "reject" ? email.rejectReason : undefined,
	}));

	return {
		id: emailId,
		from: email.from,
		to: email.to,
		subject: email.subject,
		messageId: email.messageId,
		receivedAt: email.receivedAt,
		rawSize: email.rawSize,
		attachments: email.attachments,
		recipients: [
			{
				envelopeTos: email.to,
				events,
			},
		],
	};
}

function EmailRoutingDetailView(): JSX.Element {
	const { email } = Route.useLoaderData();
	const message = toInfoMessage(email);

	return (
		<>
			<Breadcrumbs
				icon={EmailIcon}
				items={[
					<Link
						className="text-kumo-link hover:underline"
						key="routing"
						search={(prev) => prev}
						to="/email/routing"
					>
						Routing
					</Link>,
					<span className="truncate" key="subject">
						{email.subject || "(no subject)"}
					</span>,
				]}
				title="Email"
			/>

			<div className="space-y-6 px-8 py-6">
				<InfoFlow message={message} />
				<ConstantsCard message={message} />
			</div>
		</>
	);
}
