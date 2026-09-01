import type {
	EmailComposerProjection,
	EmailResendResult,
} from "../../api/email-resend";
import type { TestEmailDraft } from "./send-test-email";

export interface EmailResendFeedback {
	description?: string;
	title: string;
	variant: "error" | "success";
}

/** Extracts the first API or network error message for row-action feedback. */
export function getEmailResendErrorMessage(
	error: unknown,
	fallback: string
): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "object" && error !== null && "errors" in error) {
		const errors = (error as { errors?: unknown }).errors;
		if (Array.isArray(errors)) {
			const firstError = errors[0];
			if (
				typeof firstError === "object" &&
				firstError !== null &&
				"message" in firstError &&
				typeof firstError.message === "string"
			) {
				return firstError.message;
			}
		}
	}
	return fallback;
}

function getBase64DecodedSize(content: string): number {
	const compactContent = content.replaceAll(/\s/g, "");
	const padding = compactContent.endsWith("==")
		? 2
		: compactContent.endsWith("=")
			? 1
			: 0;
	return Math.max(0, Math.floor((compactContent.length * 3) / 4) - padding);
}

/** Converts a server projection into the text fields used by the composer. */
export function toTestEmailDraft(
	projection: EmailComposerProjection
): TestEmailDraft {
	return {
		attachments: (projection.attachments ?? []).map((attachment) => ({
			...attachment,
			size: getBase64DecodedSize(attachment.content),
		})),
		cc: (projection.cc ?? []).join(", "),
		from: projection.from,
		headers: Object.entries(projection.headers ?? {}).map(([name, value]) => ({
			name,
			value,
		})),
		html: projection.html ?? "",
		replyTo: projection.replyTo ?? "",
		subject: projection.subject,
		text: projection.text ?? "",
		to: projection.to.join(", "),
	};
}

/** Chooses accessible toast copy for an immediate resend outcome. */
export function getEmailResendFeedback(
	result: EmailResendResult
): EmailResendFeedback {
	if (result.rejectReason !== undefined) {
		return {
			description: result.rejectReason || undefined,
			title: "The Worker's email() handler rejected the resent email.",
			variant: "error",
		};
	}
	if (result.outcome === "exception") {
		return {
			title:
				"The Worker's email() handler threw while processing the resent email.",
			variant: "error",
		};
	}
	if (result.capturedPortion) {
		return {
			description:
				"Only the portion retained by local capture was available to resend.",
			title: "Captured portion resent.",
			variant: "success",
		};
	}
	return { title: "Email resent.", variant: "success" };
}
