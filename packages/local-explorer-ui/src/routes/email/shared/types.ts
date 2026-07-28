/**
 * Type model for the email detail flow diagram and constants card.
 *
 * Simplified from Stratus's LogDetail types for the local explorer
 * email routing data model.
 */

import type { EmailAttachment } from "../../../api";

export interface InfoEvent {
	/** Unique per-event key */
	id: string;
	/** The action the handler took on the message */
	action: "received" | "unhandled" | "rejected" | "forwarded" | "replied";
	/** ISO 8601 timestamp of when the action occurred */
	timestamp: string;
	/** Action-specific details (e.g. forward recipient, raw MIME) */
	details?: {
		[key: string]: unknown;
	};
}

export interface InfoRecipient {
	envelopeTos: string;
	events: InfoEvent[];
}

export interface InfoMessage {
	id: string;
	/** Envelope MAIL FROM address */
	from: string;
	/** Envelope RCPT TO address */
	to: string;
	subject: string;
	messageId?: string;
	/** ISO 8601 datetime */
	receivedAt: string;
	/** Size in bytes */
	rawSize: number;
	/** Attachment metadata; the content itself is only in the raw MIME */
	attachments: EmailAttachment[];
	recipients: InfoRecipient[];
}
