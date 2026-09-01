import type { EmailSendRequest } from "../../../api";

type AttachmentInput = NonNullable<EmailSendRequest["attachments"]>[number];

export interface SelectedTestEmailAttachment extends AttachmentInput {
	size: number;
}

export interface TestEmailHeader {
	name: string;
	value: string;
}

export interface TestEmailDraft {
	from: string;
	to: string;
	cc: string;
	replyTo: string;
	subject: string;
	headers: TestEmailHeader[];
	text: string;
	html: string;
	attachments: SelectedTestEmailAttachment[];
}

export interface TestEmailHeaderField extends TestEmailHeader {
	id: number;
	nameError?: string;
	valueError?: string;
}

export type TestEmailComposerField =
	| "from"
	| "to"
	| "cc"
	| "replyTo"
	| "subject"
	| "text"
	| "html";

export interface TestEmailComposerState {
	attachments: SelectedTestEmailAttachment[];
	attachmentsError: string | null;
	attachmentReadGeneration: number;
	cc: string;
	from: string;
	fromError: string | null;
	headers: TestEmailHeaderField[];
	html: string;
	pendingAttachmentReads: number;
	replyTo: string;
	rawFile: File | null;
	rawFileError: string | null;
	sending: boolean;
	subject: string;
	text: string;
	to: string;
	toError: string | null;
}
