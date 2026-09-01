import { WarningIcon } from "@phosphor-icons/react";
import type { JSX } from "react";

/** Warns that an edited draft was reconstructed from a partial capture. */
export function IncompleteSourceWarning(): JSX.Element {
	return (
		<div
			className="flex items-start gap-2 rounded-lg border border-kumo-warning/30 bg-kumo-warning/10 px-3 py-2 text-sm text-kumo-default"
			role="status"
		>
			<span className="flex h-lh shrink-0 items-center text-kumo-warning">
				<WarningIcon aria-hidden="true" size={14} weight="fill" />
			</span>
			<p>
				Only the captured portion of this email is available. This draft may
				omit body content or attachments that were not captured.
			</p>
		</div>
	);
}
