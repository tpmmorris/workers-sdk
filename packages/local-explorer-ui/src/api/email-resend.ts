import { emailResendDraftRouting, emailResendRouting } from "./generated";
import type {
	EmailComposerDraft,
	EmailResendDraft,
	EmailResendResult as GeneratedEmailResendResult,
} from "./generated";

export type EmailComposerProjection = EmailComposerDraft;
export type EmailResendDraftResult = EmailResendDraft;
export type EmailResendResult = GeneratedEmailResendResult;

interface EmailResendReference {
	messageId: string;
	signal?: AbortSignal;
	worker: string;
}

/** Immediately resends a received capture by Worker-scoped Message-ID. */
export function resendRoutingEmail({
	messageId,
	signal,
	worker,
}: EmailResendReference) {
	return emailResendRouting({
		query: { message_id: messageId, worker },
		signal,
		throwOnError: false,
	});
}

/** Loads the structured composer projection for a received capture. */
export function getRoutingEmailResendDraft({
	messageId,
	signal,
	worker,
}: EmailResendReference) {
	return emailResendDraftRouting({
		query: { message_id: messageId, worker },
		signal,
		throwOnError: false,
	});
}
