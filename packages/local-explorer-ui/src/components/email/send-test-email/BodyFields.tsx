import { InputArea } from "@cloudflare/kumo";
import type { JSX } from "react";

interface BodyFieldsProps {
	html: string;
	onHtmlChange: (value: string) => void;
	onTextChange: (value: string) => void;
	text: string;
}

/** Renders the structured plain-text and HTML bodies. */
export function BodyFields({
	html,
	onHtmlChange,
	onTextChange,
	text,
}: BodyFieldsProps): JSX.Element {
	return (
		<>
			<InputArea
				className="w-full resize-y"
				id="test-email-text"
				label="Text body"
				onChange={(event) => onTextChange(event.target.value)}
				placeholder="Plain text body"
				rows={4}
				value={text}
			/>

			<InputArea
				className="w-full resize-y font-mono"
				id="test-email-html"
				label="HTML body"
				onChange={(event) => onHtmlChange(event.target.value)}
				placeholder="<p>HTML body</p>"
				rows={4}
				value={html}
			/>
		</>
	);
}
