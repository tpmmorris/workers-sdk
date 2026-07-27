import { Badge, ClipboardText, LayerCard } from "@cloudflare/kumo";
import { formatSize } from "../../../utils/format";
import type { InfoMessage } from "./types";

interface ConstantsCardProps {
	message: InfoMessage;
}

const Row = ({
	label,
	children,
	className,
}: {
	label: string;
	children: React.ReactNode;
	className?: string;
}) => (
	<div className={`flex flex-col gap-1 min-w-0 ${className ?? ""}`}>
		<span className="text-xs font-semibold text-kumo-subtle uppercase tracking-wide">
			{label}
		</span>
		<div className="text-sm text-kumo-default break-words">{children}</div>
	</div>
);

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

/**
 * Invariants for the email detail page.
 *
 * Subject and Message ID span the full grid width because they're
 * typically long strings. From and To sit side-by-side.
 */
export function ConstantsCard({ message }: ConstantsCardProps) {
	return (
		<LayerCard>
			<LayerCard.Secondary>Message</LayerCard.Secondary>
			<LayerCard.Primary>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
					<Row label="Subject" className="sm:col-span-2">
						{message.subject || "—"}
					</Row>
					{message.messageId ? (
						<Row label="Message ID" className="sm:col-span-2">
							<ClipboardText text={message.messageId} />
						</Row>
					) : null}
					<Row label="From">
						<Badge variant="outline">{message.from || "—"}</Badge>
					</Row>
					<Row label="To">
						<Badge variant="outline">{message.to || "—"}</Badge>
					</Row>
					<Row label="Received">{formatTimestamp(message.receivedAt)}</Row>
					<Row label="Size">{formatSize(message.rawSize)}</Row>
				</div>
			</LayerCard.Primary>
		</LayerCard>
	);
}
