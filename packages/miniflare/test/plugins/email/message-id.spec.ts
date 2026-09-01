import { Buffer } from "node:buffer";
import { test } from "vitest";
import { setMessageIdHeader } from "../../../src/workers/email/message-id";

const NEW_MESSAGE_ID = "<new-message-id@example.com>";

function replaceMessageId(raw: Uint8Array | string): Uint8Array {
	return setMessageIdHeader(
		typeof raw === "string" ? new TextEncoder().encode(raw) : raw,
		NEW_MESSAGE_ID
	);
}

for (const [name, eol] of [
	["CRLF", "\r\n"],
	["LF", "\n"],
] as const) {
	test(`replaces duplicate and folded Message-ID headers with ${name} input`, ({
		expect,
	}) => {
		const raw = [
			"From: sender@example.com",
			"Message-ID: <old-one@example.com>",
			"\tcontinued-value",
			"Subject: Unchanged",
			"message-id: <old-two@example.com>",
			"To: recipient@example.com",
			"",
			"Message-ID: body text must remain",
		].join(eol);

		expect(new TextDecoder().decode(replaceMessageId(raw))).toBe(
			[
				"From: sender@example.com",
				`Message-ID: ${NEW_MESSAGE_ID}`,
				"Subject: Unchanged",
				"To: recipient@example.com",
				"",
				"Message-ID: body text must remain",
			].join(eol)
		);
	});
}

test("inserts Message-ID without changing multipart MIME bytes", ({
	expect,
}) => {
	const raw = [
		"From: sender@example.com",
		"To: recipient@example.com",
		'Content-Type: multipart/mixed; boundary="boundary"',
		"",
		"preamble",
		"--boundary",
		"Content-Type: application/octet-stream",
		"",
		"Message-ID: nested body header",
		"--boundary--",
	].join("\r\n");

	const expected = new TextEncoder().encode(
		[
			`Message-ID: ${NEW_MESSAGE_ID}`,
			"From: sender@example.com",
			"To: recipient@example.com",
			'Content-Type: multipart/mixed; boundary="boundary"',
			"",
			"preamble",
			"--boundary",
			"Content-Type: application/octet-stream",
			"",
			"Message-ID: nested body header",
			"--boundary--",
		].join("\r\n")
	);
	const replaced = replaceMessageId(raw);
	expect(replaced).toEqual(expected);
});

test("preserves non-UTF-8 header and body bytes", ({ expect }) => {
	const headers = new TextEncoder().encode(
		"From: sender@example.com\r\nMessage-ID: <old@example.com>\r\nX-Raw: "
	);
	const suffix = new Uint8Array([0xff, 0xfe, 13, 10, 13, 10, 0x80, 0x00, 0x81]);
	const raw = new Uint8Array(headers.byteLength + suffix.byteLength);
	raw.set(headers);
	raw.set(suffix, headers.byteLength);

	const replaced = replaceMessageId(raw);
	const expected = Buffer.concat([
		Buffer.from(
			`From: sender@example.com\r\nMessage-ID: ${NEW_MESSAGE_ID}\r\nX-Raw: `
		),
		Buffer.from(suffix),
	]);
	expect(Buffer.from(replaced)).toEqual(expected);
});

test("supports an empty body", ({ expect }) => {
	const raw = "From: sender@example.com\r\nTo: recipient@example.com\r\n\r\n";
	expect(new TextDecoder().decode(replaceMessageId(raw))).toBe(
		`Message-ID: ${NEW_MESSAGE_ID}\r\n${raw}`
	);
});

test("rejects MIME without a header/body separator", ({ expect }) => {
	expect(() => replaceMessageId("From: sender@example.com")).toThrow(
		"could not find end of email headers"
	);
});
