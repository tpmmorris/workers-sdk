---
"miniflare": minor
"wrangler": patch
---

Capture locally sent and received emails for development inspection. Stored emails now use a consistent ID format derived from that used in mimetext, which uses Math.random() to generate an ID, which is then converted to base 36. Emails will be stored in a Durable Object and the local filesystem using this ID, rather than the previous format (UUID). Emails sent using the send_email binding always synthesise a new message ID rather than

Miniflare now exposes stored emails and handler events through the Local Explorer email APIs, including worker-specific filtering and multi-process aggregation. Wrangler's email test harness reuses the shared handler result (which has been updated to store a chronological list of events) so programmatic local email tests report the same event data.

Note that when sending email via the `send_email` binding, the workerd-side capture is completed before `send()` resolves, but the on-disk debugging artifacts and the `send_email binding called with ...` log line are now written asynchronously after `send()` resolves. When reading the logged file path immediately after awaiting `send()`, one should not assume the file exists yet.

```ts
const result = await server.getWorker().email({
	from: "sender@example.com",
	to: "inbox@example.com",
	raw: [
		"From: Sender <sender@example.com>",
		"To: Inbox <inbox@example.com>",
		"Message-ID: <test@example.com>",
		"Subject: Test email",
		"",
		"Hello from the test harness",
	].join("\r\n"),
});

expect(result).toEqual({
	outcome: "ok",
	forwards: [
		{
			messageId: expect.any(String),
			recipient: "archive@example.com",
			headers: [],
		},
	],
	replies: [
		{
			messageId: expect.any(String),
			sender: "reply@example.com",
			raw: expect.stringContaining("Thanks for your email"),
		},
	],
	events: [
		{ type: "received", timestamp: expect.any(String) },
		{
			type: "forward",
			timestamp: expect.any(String),
			messageId: expect.any(String),
		},
		{
			type: "reply",
			timestamp: expect.any(String),
			messageId: expect.any(String),
		},
	],
});
```
