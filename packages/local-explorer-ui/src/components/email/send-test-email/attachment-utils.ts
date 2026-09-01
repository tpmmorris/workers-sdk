import type { SelectedTestEmailAttachment } from "./types";

/** Advances the token used to reject results from stale attachment reads. */
export function nextAttachmentReadGeneration(current: number): number {
	return current + 1;
}

/** Converts bytes to Base64 without exceeding String.fromCharCode limits. */
export function bytesToBase64(bytes: Uint8Array): string {
	const chunkSize = 0x8000;
	let binary = "";
	for (let index = 0; index < bytes.length; index += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
	}
	return btoa(binary);
}

/** Reads attachment files into the structured email API representation. */
export async function readAttachmentFiles(
	files: File[]
): Promise<SelectedTestEmailAttachment[]> {
	return Promise.all(
		files.map(async (file) => ({
			filename: file.name,
			type: file.type || "application/octet-stream",
			content: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
			size: file.size,
		}))
	);
}
