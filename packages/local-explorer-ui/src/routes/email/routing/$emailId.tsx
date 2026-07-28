import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import type { JSX } from "react";
import { emailGetRouting } from "../../../api";
import type { EmailRoutingAction } from "../../../api";
import EmailIcon from "../../../assets/icons/email.svg?react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { NotFound } from "../../../components/NotFound";
import { ResourceError } from "../../../components/ResourceError";
import { ConstantsCard } from "../shared/ConstantsCard";
import { InfoFlow } from "../shared/InfoFlow";
import { InfoLoading } from "../shared/InfoLoading";
import type { InfoEvent, InfoMessage } from "../shared/types";

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

function toInfoMessage(email: Awaited<ReturnType<typeof Route.useLoaderData>>["email"]): InfoMessage {
	const events: InfoEvent[] = email.handlingPath.map((action: EmailRoutingAction, index: number) => ({
		id: `${email.id}-${index}`,
		action: action.action,
		timestamp: action.timestamp,
		details: action.details,
	}));

	return {
		id: email.id,
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
