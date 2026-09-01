import { ComposerInput, RequiredLabel } from "./ComposerInput";
import type { TestEmailComposerField, TestEmailComposerState } from "./types";
import type { JSX } from "react";

type AddressField = Exclude<TestEmailComposerField, "html" | "text">;

interface AddressFieldsProps {
	errors: Pick<TestEmailComposerState, "fromError" | "toError">;
	onChange: (field: AddressField, value: string) => void;
	values: Pick<
		TestEmailComposerState,
		"bcc" | "cc" | "from" | "replyTo" | "subject" | "to"
	>;
}

/** Renders structured message addressing and subject fields. */
export function AddressFields({
	errors,
	onChange,
	values,
}: AddressFieldsProps): JSX.Element {
	return (
		<>
			<ComposerInput
				aria-invalid={errors.fromError ? true : undefined}
				className={errors.fromError ? "ring-2 !ring-kumo-danger" : undefined}
				error={errors.fromError ?? undefined}
				id="test-email-from"
				label={<RequiredLabel>From</RequiredLabel>}
				onChange={(event) => onChange("from", event.target.value)}
				placeholder="sender@example.com"
				required
				type="text"
				value={values.from}
			/>

			<ComposerInput
				aria-invalid={errors.toError ? true : undefined}
				className={errors.toError ? "ring-2 !ring-kumo-danger" : undefined}
				error={errors.toError ?? undefined}
				id="test-email-to"
				label={<RequiredLabel>To</RequiredLabel>}
				labelTooltip="Only the first parsed address is used as the envelope recipient. All addresses remain in the To header."
				onChange={(event) => onChange("to", event.target.value)}
				placeholder="recipient@example.com, another@example.com"
				required
				type="text"
				value={values.to}
			/>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<ComposerInput
					id="test-email-cc"
					label="Cc"
					onChange={(event) => onChange("cc", event.target.value)}
					placeholder="cc@example.com"
					type="text"
					value={values.cc}
				/>
				<ComposerInput
					id="test-email-bcc"
					label="Bcc"
					onChange={(event) => onChange("bcc", event.target.value)}
					placeholder="bcc@example.com"
					type="text"
					value={values.bcc}
				/>
			</div>

			<ComposerInput
				id="test-email-reply-to"
				label="Reply-To"
				onChange={(event) => onChange("replyTo", event.target.value)}
				placeholder="reply@example.com"
				type="text"
				value={values.replyTo}
			/>

			<ComposerInput
				id="test-email-subject"
				label="Subject"
				onChange={(event) => onChange("subject", event.target.value)}
				placeholder="Hello from the local explorer"
				type="text"
				value={values.subject}
			/>
		</>
	);
}
