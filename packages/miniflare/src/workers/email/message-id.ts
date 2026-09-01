// Message-ID handling shared by the paths that capture emails: the `send_email`
// binding and the local explorer's "send test email" endpoint. Both must agree
// on the format, because the id derived from a Message-ID keys the explorer's
// record.

const ID_ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Builds a Message-ID in the shape the production `send_email` binding returns:
 * `<{36 base-62 characters}@{sender domain}>`.
 */
export function synthesizeMessageId(senderEmail: string): string {
	const bytes = crypto.getRandomValues(new Uint8Array(36));
	const id = Array.from(
		bytes,
		(byte) => ID_ALPHABET[byte % ID_ALPHABET.length]
	).join("");
	const domain = senderEmail.slice(senderEmail.lastIndexOf("@") + 1);
	return `<${id}@${domain}>`;
}

/**
 * Sets the top-level Message-ID header without decoding or rewriting the MIME
 * body. Existing folded or duplicate Message-ID headers are replaced by one
 * normalized header.
 */
export function setMessageIdHeader(
	rawEmail: Uint8Array,
	messageId: string
): Uint8Array {
	const header = findHeaderLayout(rawEmail);
	if (header === undefined) {
		throw new Error("could not find end of email headers");
	}

	const messageIdHeader = new TextEncoder().encode(
		`Message-ID: ${messageId}${header.lineEnding}`
	);
	const removals = findMessageIdHeaders(rawEmail, header.linesEnd);
	if (removals.length === 0) {
		const normalizedEmail = new Uint8Array(
			messageIdHeader.byteLength + rawEmail.byteLength
		);
		normalizedEmail.set(messageIdHeader);
		normalizedEmail.set(rawEmail, messageIdHeader.byteLength);
		return normalizedEmail;
	}

	const removedBytes = removals.reduce(
		(total, removal) => total + removal.end - removal.start,
		0
	);
	const normalizedEmail = new Uint8Array(
		rawEmail.byteLength - removedBytes + messageIdHeader.byteLength
	);
	let sourceOffset = 0;
	let targetOffset = 0;
	for (const [index, removal] of removals.entries()) {
		const retained = rawEmail.subarray(sourceOffset, removal.start);
		normalizedEmail.set(retained, targetOffset);
		targetOffset += retained.byteLength;
		if (index === 0) {
			normalizedEmail.set(messageIdHeader, targetOffset);
			targetOffset += messageIdHeader.byteLength;
		}
		sourceOffset = removal.end;
	}
	normalizedEmail.set(rawEmail.subarray(sourceOffset), targetOffset);
	return normalizedEmail;
}

function findHeaderLayout(
	rawEmail: Uint8Array
): { lineEnding: "\r\n" | "\n"; linesEnd: number } | undefined {
	const crlfHeaderEnd = findSequence(
		rawEmail,
		new Uint8Array([13, 10, 13, 10])
	);
	const lfHeaderEnd = findSequence(rawEmail, new Uint8Array([10, 10]));
	if (crlfHeaderEnd === -1 && lfHeaderEnd === -1) {
		return;
	}
	const usesCrlf =
		crlfHeaderEnd !== -1 &&
		(lfHeaderEnd === -1 || crlfHeaderEnd <= lfHeaderEnd);
	return usesCrlf
		? { lineEnding: "\r\n", linesEnd: crlfHeaderEnd + 2 }
		: { lineEnding: "\n", linesEnd: lfHeaderEnd + 1 };
}

function findMessageIdHeaders(
	rawEmail: Uint8Array,
	headerEnd: number
): Array<{ start: number; end: number }> {
	const removals: Array<{ start: number; end: number }> = [];
	let offset = 0;
	let headerStart = 0;
	let removeHeader = false;
	while (offset < headerEnd) {
		const lineEnd = findLineEnd(rawEmail, offset, headerEnd);
		const continuation = rawEmail[offset] === 0x20 || rawEmail[offset] === 0x09;
		if (!continuation) {
			if (removeHeader) {
				removals.push({ start: headerStart, end: offset });
			}
			headerStart = offset;
			removeHeader = headerNameMatches(
				rawEmail,
				offset,
				lineEnd.contentEnd,
				"message-id"
			);
		}
		offset = lineEnd.end;
	}
	if (removeHeader) {
		removals.push({ start: headerStart, end: offset });
	}
	return removals;
}

function findLineEnd(
	rawEmail: Uint8Array,
	start: number,
	limit: number
): { contentEnd: number; end: number } {
	for (let index = start; index < limit; index++) {
		if (rawEmail[index] !== 0x0a) {
			continue;
		}
		return {
			contentEnd:
				index > start && rawEmail[index - 1] === 0x0d ? index - 1 : index,
			end: index + 1,
		};
	}
	return { contentEnd: limit, end: limit };
}

function headerNameMatches(
	rawEmail: Uint8Array,
	start: number,
	end: number,
	headerName: string
): boolean {
	let colon = start;
	while (colon < end && rawEmail[colon] !== 0x3a) {
		colon++;
	}
	if (colon === end || colon - start !== headerName.length) {
		return false;
	}
	for (let index = 0; index < headerName.length; index++) {
		const byte = rawEmail[start + index];
		const lowerByte = byte >= 0x41 && byte <= 0x5a ? byte + 0x20 : byte;
		if (lowerByte !== headerName.charCodeAt(index)) {
			return false;
		}
	}
	return true;
}

function findSequence(bytes: Uint8Array, sequence: Uint8Array): number {
	for (
		let index = 0;
		index <= bytes.byteLength - sequence.byteLength;
		index++
	) {
		if (
			sequence.every(
				(value, sequenceIndex) => bytes[index + sequenceIndex] === value
			)
		) {
			return index;
		}
	}
	return -1;
}

/**
 * Derives the id an email is indexed under from its Message-ID by stripping the
 * enclosing angle brackets.
 *
 * This id keys the local explorer record, so a message listed in the explorer
 * can be looked up by it.
 */
export function messageIdToStorageId(messageId: string): string {
	return messageId.replace(/^<|>$/g, "");
}

/**
 * Extracts the bare email address from a string that may be in `"Name"
 * <address>`, `Name <address>`, or plain `address` form.
 */
export function extractAddressFromString(value: string): string {
	const match = value.match(/<([^>]+)>\s*$/u);
	return (match ? match[1] : value).trim();
}
