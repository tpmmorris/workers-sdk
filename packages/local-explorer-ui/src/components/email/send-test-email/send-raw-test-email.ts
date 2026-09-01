import { client } from "../../../api/generated/client.gen";
import type {
	EmailSendRoutingErrors,
	EmailSendRoutingResponses,
} from "../../../api";

/** Sends raw MIME bytes through the shared test-email endpoint. */
export function sendRawTestEmail(file: File, worker: string) {
	return client.post<EmailSendRoutingResponses, EmailSendRoutingErrors, false>({
		body: file,
		bodySerializer: null,
		headers: { "Content-Type": "message/rfc822" },
		query: { worker },
		throwOnError: false,
		url: "/local/email/routing/send",
	});
}
