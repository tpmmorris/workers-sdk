import { describe, test } from "vitest";
import {
	getEmailResendFeedback,
	toTestEmailDraft,
} from "../../components/email/email-resend-utils";

describe("email resend utilities", () => {
	test("maps all projected fields and attachment bytes into a composer draft", ({
		expect,
	}) => {
		expect(
			toTestEmailDraft({
				attachments: [
					{
						content: "aGVsbG8=",
						contentId: "logo",
						disposition: "inline",
						filename: "logo.txt",
						type: "text/plain",
					},
				],
				cc: ["first@example.com", "second@example.com"],
				from: "Sender <sender@example.com>",
				headers: { "X-First": "one", "X-Second": "two" },
				html: "<p>Hello</p>",
				replyTo: "reply@example.com",
				subject: "Projected subject",
				text: "Hello",
				to: ["one@example.com", "two@example.com"],
			})
		).toEqual({
			attachments: [
				{
					content: "aGVsbG8=",
					contentId: "logo",
					disposition: "inline",
					filename: "logo.txt",
					size: 5,
					type: "text/plain",
				},
			],
			cc: "first@example.com, second@example.com",
			from: "Sender <sender@example.com>",
			headers: [
				{ name: "X-First", value: "one" },
				{ name: "X-Second", value: "two" },
			],
			html: "<p>Hello</p>",
			replyTo: "reply@example.com",
			subject: "Projected subject",
			text: "Hello",
			to: "one@example.com, two@example.com",
		});
	});

	test("uses outcome-specific feedback including captured portions", ({
		expect,
	}) => {
		expect(
			getEmailResendFeedback({
				capturedPortion: true,
				messageId: "<partial@example.com>",
				outcome: "ok",
			})
		).toMatchObject({
			title: "Captured portion resent.",
			variant: "success",
		});
		expect(
			getEmailResendFeedback({
				capturedPortion: false,
				messageId: "<rejected@example.com>",
				outcome: "ok",
				rejectReason: "Mailbox unavailable",
			})
		).toEqual({
			description: "Mailbox unavailable",
			title: "The Worker's email() handler rejected the resent email.",
			variant: "error",
		});
		expect(
			getEmailResendFeedback({
				capturedPortion: false,
				messageId: "<exception@example.com>",
				outcome: "exception",
			})
		).toMatchObject({ variant: "error" });
	});
});
