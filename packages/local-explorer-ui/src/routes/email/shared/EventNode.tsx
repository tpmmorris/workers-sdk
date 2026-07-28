import { Button, Flow, cn } from "@cloudflare/kumo";
import {
	ArrowBendUpLeftIcon,
	ArrowUpRightIcon,
	CaretDownIcon,
	EnvelopeSimpleIcon,
	ProhibitIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import type { InfoEvent } from "./types";
import type { JSX } from "react";

// ---------------------------------------------------------------------------
// Action visual mapping
// ---------------------------------------------------------------------------

const ACTION_CONFIG: Record<
	InfoEvent["action"],
	{
		icon: React.ComponentType<{ className?: string; size?: number }>;
		label: string;
		color: string;
	}
> = {
	received: {
		icon: EnvelopeSimpleIcon,
		label: "Received",
		color: "text-kumo-success",
	},
	forwarded: {
		icon: ArrowUpRightIcon,
		label: "Forwarded",
		color: "text-kumo-link",
	},
	replied: {
		icon: ArrowBendUpLeftIcon,
		label: "Replied",
		color: "text-kumo-link",
	},
	rejected: {
		icon: ProhibitIcon,
		label: "Rejected",
		color: "text-kumo-danger",
	},
	unhandled: {
		icon: WarningIcon,
		label: "Unhandled (no email() handler)",
		color: "text-kumo-danger",
	},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: string): string {
	try {
		const d = new Date(ts);
		return new Intl.DateTimeFormat("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: true,
		}).format(d);
	} catch {
		return ts;
	}
}

function EventIcon({ action }: { action: InfoEvent["action"] }): JSX.Element {
	const config = ACTION_CONFIG[action];
	const Icon = config.icon;
	return <Icon size={20} className={config.color} />;
}

const Field = ({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) => (
	<div className="flex min-w-0 flex-col gap-1">
		<span className="text-xs font-semibold tracking-wide text-kumo-subtle uppercase">
			{label}
		</span>
		<span className="text-sm break-words text-kumo-default">{children}</span>
	</div>
);

// ---------------------------------------------------------------------------
// EventNode
// ---------------------------------------------------------------------------

interface EventNodeProps {
	event: InfoEvent;
}

/**
 * One event in a message's lifecycle, rendered as a Kumo `Flow.Node`
 * with an expandable body.
 *
 * The header row (icon + label + timestamp + chevron) is wrapped
 * in `<Flow.Anchor>` so the connector lines always attach to a
 * height-stable element — when the body expands, the anchor doesn't
 * move, so connectors stay aligned.
 */
export function EventNode({ event }: EventNodeProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const config = ACTION_CONFIG[event.action];

	const replyRaw =
		event.action === "replied" && typeof event.details?.raw === "string"
			? event.details.raw
			: undefined;

	// Any remaining details are shown as field rows. The reply's
	// raw MIME is excluded — it has its own presentation.
	const inlineDetails = event.details
		? Object.fromEntries(
				Object.entries(event.details).filter(
					([key]) => key !== "raw" && key !== "subject"
				)
			)
		: undefined;
	const hasInlineDetails =
		inlineDetails && Object.keys(inlineDetails).length > 0;

	// Custom reply body fields extracted from details.
	const replyFrom =
		event.action === "replied" && typeof event.details?.from === "string"
			? event.details.from
			: undefined;
	const replyTo =
		event.action === "replied" && typeof event.details?.to === "string"
			? event.details.to
			: undefined;
	const replyMessageId =
		event.action === "replied" && typeof event.details?.messageId === "string"
			? event.details.messageId
			: undefined;
	const hasReplyFields =
		replyFrom !== undefined ||
		replyTo !== undefined ||
		replyMessageId !== undefined;

	const isExpandable =
		replyRaw !== undefined || hasInlineDetails || hasReplyFields;

	return (
		<Flow.Node
			render={
				<li
					data-testid="log-detail-event-node"
					data-action={event.action}
					data-open={open || undefined}
					className={cn(
						"list-none rounded-lg bg-kumo-base shadow-sm ring ring-kumo-hairline",
						"max-w-[420px] min-w-[280px]"
					)}
				>
					<Flow.Anchor
						render={
							<div className="flex min-h-12 items-center gap-3 px-4 py-2">
								<EventIcon action={event.action} />
								<div className="flex min-w-0 flex-1 flex-col">
									<span className="truncate text-sm font-medium text-kumo-default">
										{config.label}
									</span>
									<span className="text-xs text-kumo-subtle">
										{formatTimestamp(event.timestamp)}
									</span>
								</div>
								{isExpandable && (
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setOpen((prev) => !prev)}
										aria-expanded={open}
										aria-label={
											open ? "Collapse event details" : "Expand event details"
										}
									>
										<CaretDownIcon
											size={16}
											className={cn(
												"transition-transform",
												open && "rotate-180"
											)}
										/>
									</Button>
								)}
							</div>
						}
					/>
					{open && (
						<div data-testid="log-detail-event-body">
							{(hasInlineDetails || hasReplyFields) && (
								<div className="grid grid-cols-2 gap-4 border-t border-kumo-line px-4 py-3">
									{event.action === "replied" && (
										<>
											{replyFrom && <Field label="From">{replyFrom}</Field>}
											{replyTo && <Field label="To">{replyTo}</Field>}
										</>
									)}
									{hasInlineDetails &&
										event.action !== "replied" &&
										Object.entries(inlineDetails).map(([key, value]) => (
											<Field key={key} label={key}>
												{typeof value === "string"
													? value
													: JSON.stringify(value)}
											</Field>
										))}
								</div>
							)}
							{replyRaw && (
								<pre className="max-h-[40vh] overflow-auto border-t border-kumo-line bg-kumo-elevated p-4 font-mono text-xs whitespace-pre-wrap text-kumo-default">
									{replyRaw}
								</pre>
							)}
						</div>
					)}
				</li>
			}
		/>
	);
}
