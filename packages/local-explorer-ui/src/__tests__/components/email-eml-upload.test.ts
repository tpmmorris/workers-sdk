import { describe, test } from "vitest";
import {
	getRawEmailSelectionError,
	MAX_RAW_EMAIL_SIZE,
} from "../../components/email/send-test-email/raw-email-validation";

function file(name: string, size = 1): Pick<File, "name" | "size"> {
	return { name, size };
}

describe("raw email file selection", () => {
	test("accepts one case-insensitive .eml extension", ({ expect }) => {
		expect(getRawEmailSelectionError([file("message.eml")])).toBeNull();
		expect(getRawEmailSelectionError([file("MESSAGE.EML")])).toBeNull();
	});

	test("requires exactly one file", ({ expect }) => {
		expect(getRawEmailSelectionError([])).toBe("Select exactly one .eml file.");
		expect(
			getRawEmailSelectionError([file("first.eml"), file("second.eml")])
		).toBe("Select exactly one .eml file.");
	});

	test("rejects files without a final .eml extension", ({ expect }) => {
		expect(getRawEmailSelectionError([file("message.txt")])).toBe(
			"Select a file with a .eml extension."
		);
		expect(getRawEmailSelectionError([file("message.eml.txt")])).toBe(
			"Select a file with a .eml extension."
		);
	});

	test("allows exactly 25 MiB and rejects larger files", ({ expect }) => {
		expect(
			getRawEmailSelectionError([file("message.eml", MAX_RAW_EMAIL_SIZE)])
		).toBeNull();
		expect(
			getRawEmailSelectionError([file("message.eml", MAX_RAW_EMAIL_SIZE + 1)])
		).toBe("Select a .eml file that is 25 MiB or smaller.");
	});
});
