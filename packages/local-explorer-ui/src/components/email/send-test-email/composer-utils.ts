import {
	hasInvalidEmailHeaderValueCharacters,
	isEmailHeaderName,
	isManagedEmailHeaderName,
} from "../../../utils/email-headers";
import type { EmailSendRequest, EmailSendRoutingError } from "../../../api";
import type {
	TestEmailComposerState,
	TestEmailDraft,
	TestEmailHeaderField,
} from "./types";

const EMAIL_SEND_FAILED_CODE = 10602;

export interface TestEmailComposerValidation {
	attachmentsError: string | null;
	fromError: string | null;
	headers: TestEmailHeaderField[];
	request?: EmailSendRequest;
	toError: string | null;
}

/** Identifies the send failure that still leaves a captured email to inspect. */
export function isMissingEmailHandlerError(
	error: EmailSendRoutingError | undefined,
	worker: string
): boolean {
	return (
		error?.errors.some(
			({ code, message }) =>
				code === EMAIL_SEND_FAILED_CODE &&
				message === `Worker '${worker}' does not export an email() handler.`
		) === true
	);
}

/** Extracts a user-facing message from generated-client or network errors. */
export function getEmailSendErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "object" && error !== null && "errors" in error) {
		const errors = (error as { errors?: unknown }).errors;
		if (Array.isArray(errors)) {
			const first = errors[0];
			if (
				typeof first === "object" &&
				first !== null &&
				"message" in first &&
				typeof first.message === "string"
			) {
				return first.message;
			}
		}
	}
	return "Failed to send test email.";
}

/** Splits comma/newline-separated mailboxes without splitting quoted names. */
export function parseAddressList(value: string): string[] {
	const addresses: string[] = [];
	let current = "";
	let angleDepth = 0;
	let commentDepth = 0;
	let escaped = false;
	let quoted = false;

	function commitAddress(): void {
		const address = current.trim();
		if (address) {
			addresses.push(address);
		}
		current = "";
	}

	for (const character of value) {
		if (escaped) {
			current += character;
			escaped = false;
			continue;
		}
		if ((quoted || commentDepth > 0) && character === "\\") {
			current += character;
			escaped = true;
			continue;
		}
		if (commentDepth === 0 && character === '"') {
			quoted = !quoted;
			current += character;
			continue;
		}
		if (!quoted) {
			if (angleDepth === 0 && character === "(") {
				commentDepth++;
			} else if (angleDepth === 0 && character === ")" && commentDepth > 0) {
				commentDepth--;
			} else if (commentDepth === 0 && character === "<") {
				angleDepth++;
			} else if (commentDepth === 0 && character === ">" && angleDepth > 0) {
				angleDepth--;
			}
		}
		if (
			!quoted &&
			angleDepth === 0 &&
			commentDepth === 0 &&
			(character === "," || character === "\n" || character === "\r")
		) {
			commitAddress();
		} else {
			current += character;
		}
	}
	commitAddress();
	return addresses;
}

/** Creates an independent structured draft with all optional input defaulted. */
export function normalizeTestEmailDraft(
	draft?: TestEmailDraft
): TestEmailDraft {
	return {
		from: draft?.from ?? "",
		to: draft?.to ?? "",
		cc: draft?.cc ?? "",
		replyTo: draft?.replyTo ?? "",
		subject: draft?.subject ?? "",
		headers: (draft?.headers ?? []).map((header) => ({ ...header })),
		text: draft?.text ?? "",
		html: draft?.html ?? "",
		attachments: (draft?.attachments ?? []).map((attachment) => ({
			...attachment,
		})),
	};
}

/** Validates composer state and constructs its structured send request. */
export function validateTestEmailComposer(
	state: TestEmailComposerState
): TestEmailComposerValidation {
	const recipients = parseAddressList(state.to);
	const customHeaders = new Map<string, string>();
	const usedHeaderNames = new Set<string>();
	let hasHeaderError = false;
	const headers = state.headers.map((header) => {
		const name = header.name.trim();
		let nameError: string | undefined;
		let valueError: string | undefined;

		if (!name && !header.value) {
			return { ...header, nameError, valueError };
		}
		if (!name) {
			nameError = "Enter a header name.";
		} else if (!isEmailHeaderName(name)) {
			nameError = "Enter a valid header name.";
		} else if (isManagedEmailHeaderName(name)) {
			nameError = `${name} is managed by the email composer and cannot be overridden.`;
		} else if (usedHeaderNames.has(name.toLowerCase())) {
			nameError = "Header names must be unique.";
		} else {
			usedHeaderNames.add(name.toLowerCase());
			customHeaders.set(name, header.value);
		}

		if (hasInvalidEmailHeaderValueCharacters(header.value)) {
			valueError =
				"Header values may only contain printable characters and line breaks.";
		}
		hasHeaderError ||= nameError !== undefined || valueError !== undefined;
		return { ...header, nameError, valueError };
	});
	const fromError = state.from.trim() ? null : "A sender address is required.";
	const toError =
		recipients.length > 0 ? null : "At least one recipient is required.";
	const attachmentsError =
		state.pendingAttachmentReads > 0
			? "Wait for the selected attachments to finish loading."
			: null;

	if (fromError || toError || hasHeaderError || attachmentsError) {
		return { attachmentsError, fromError, headers, toError };
	}

	const request: EmailSendRequest = {
		from: state.from.trim(),
		to: recipients,
		subject: state.subject.trim(),
	};
	const cc = parseAddressList(state.cc);
	if (cc.length > 0) {
		request.cc = cc;
	}
	if (state.replyTo.trim()) {
		request.replyTo = state.replyTo.trim();
	}
	if (state.text.trim()) {
		request.text = state.text;
	}
	if (state.html.trim()) {
		request.html = state.html;
	}
	if (customHeaders.size > 0) {
		request.headers = Object.fromEntries(customHeaders);
	}
	if (state.attachments.length > 0) {
		request.attachments = state.attachments.map(
			({ size: _size, ...attachment }) => attachment
		);
	}

	return {
		attachmentsError,
		fromError,
		headers,
		request,
		toError,
	};
}
