import { Button, Tooltip } from "@cloudflare/kumo";
import { PaperPlaneRightIcon, PenIcon } from "@phosphor-icons/react";
import type { JSX, MouseEvent } from "react";

const DEFAULT_EDIT_UNAVAILABLE_REASON =
	"This email was not sent from the structured composer and cannot be edited and resent.";

interface RoutingEmailRowActionsProps {
	editAvailable: boolean;
	editUnavailableReason?: string;
	editing: boolean;
	onEdit: () => void;
	onResend: () => void;
	resending: boolean;
}

/** Renders independent edit and immediate-resend controls for a Routing row. */
export function RoutingEmailRowActions({
	editAvailable,
	editUnavailableReason,
	editing,
	onEdit,
	onResend,
	resending,
}: RoutingEmailRowActionsProps): JSX.Element {
	const editTooltip = editAvailable
		? "Edit and resend"
		: (editUnavailableReason ?? DEFAULT_EDIT_UNAVAILABLE_REASON);

	function stopRowActivation(event: MouseEvent<HTMLButtonElement>): void {
		event.stopPropagation();
	}

	return (
		<div className="flex w-[4.75rem] shrink-0 items-center justify-end gap-1 pr-2">
			<Tooltip content={editTooltip} asChild>
				<Button
					aria-busy={editing || undefined}
					aria-disabled={!editAvailable || undefined}
					aria-label="Edit and resend"
					className={
						!editAvailable ? "cursor-not-allowed opacity-40" : undefined
					}
					disabled={editing}
					loading={editing}
					onClick={(event) => {
						stopRowActivation(event);
						if (editAvailable) {
							onEdit();
						}
					}}
					onKeyDown={(event) => event.stopPropagation()}
					shape="square"
					type="button"
					variant="ghost"
				>
					<PenIcon aria-hidden="true" size={14} />
				</Button>
			</Tooltip>
			<Tooltip content={resending ? "Resending" : "Resend"} asChild>
				<Button
					aria-busy={resending || undefined}
					aria-label="Resend"
					disabled={resending}
					loading={resending}
					onClick={(event) => {
						stopRowActivation(event);
						onResend();
					}}
					onKeyDown={(event) => event.stopPropagation()}
					shape="square"
					type="button"
					variant="ghost"
				>
					<PaperPlaneRightIcon aria-hidden="true" size={14} />
				</Button>
			</Tooltip>
		</div>
	);
}
