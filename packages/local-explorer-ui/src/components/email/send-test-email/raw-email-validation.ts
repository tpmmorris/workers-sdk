export const MAX_RAW_EMAIL_SIZE = 25 * 1024 * 1024;

/** Returns an accessible selection error for invalid raw-email file lists. */
export function getRawEmailSelectionError(
	files: ReadonlyArray<Pick<File, "name" | "size">>
): string | null {
	if (files.length !== 1) {
		return "Select exactly one .eml file.";
	}
	const file = files[0];
	if (!file || !file.name.toLowerCase().endsWith(".eml")) {
		return "Select a file with a .eml extension.";
	}
	if (file.size > MAX_RAW_EMAIL_SIZE) {
		return "Select a .eml file that is 25 MiB or smaller.";
	}
	return null;
}
