import { afterEach, describe, test } from "vitest";
import { page, viteUrl } from "../utils";
import {
	cleanupEmailMocks,
	EMAIL_ROUTING_DETAIL_ROUTE,
	EMAIL_ROUTING_RESEND_DRAFT_ROUTE,
	EMAIL_ROUTING_RESEND_ROUTE,
	EMAIL_ROUTING_SEND_ROUTE,
	fulfillApiResult,
	loadWorker,
	mockEmailRoutingDetail,
	mockEmptyEmailSending,
} from "./utils";
import type { Request } from "playwright-chromium";

afterEach(async () => {
	await cleanupEmailMocks();
});

describe("email routing", () => {
	test("navigates from collapsed Email group links", async ({ expect }) => {
		await mockEmailRoutingDetail();
		await mockEmptyEmailSending();
		await loadWorker();

		const sidebar = page.locator('[data-sidebar="sidebar"]');
		if ((await sidebar.getAttribute("data-state")) !== "collapsed") {
			await page.getByRole("button", { name: "Toggle sidebar" }).click();
		}
		await expect
			.poll(() => sidebar.getAttribute("data-state"))
			.toBe("collapsed");

		const emailGroup = page.getByRole("button", {
			exact: true,
			name: "Email",
		});
		await page.locator("html").evaluate((element) => {
			element.dataset.spaNavigationMarker = "preserved";
		});
		await emailGroup.hover();
		await emailGroup.click();
		await page.getByRole("link", { name: "Routing", exact: true }).click();
		await expect
			.poll(() => new URL(page.url()).pathname)
			.toMatch(/\/email\/routing$/);
		expect(
			await page.locator("html").getAttribute("data-spa-navigation-marker")
		).toBe("preserved");

		// The popup stays open across SPA navigation. Clicking its trigger here
		// would close it while the next link is being selected.
		const sendingLink = page.getByRole("link", {
			name: "Sending",
			exact: true,
		});
		await sendingLink.waitFor();
		await sendingLink.click();
		await expect
			.poll(() => new URL(page.url()).pathname)
			.toMatch(/\/email\/sending$/);
		expect(
			await page.locator("html").getAttribute("data-spa-navigation-marker")
		).toBe("preserved");
	});

	test("waits for attachments and keeps an in-flight send dialog open", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail();
		await loadWorker();
		let releaseSend: (() => void) | undefined;
		const sendReleased = new Promise<void>((resolve) => {
			releaseSend = resolve;
		});
		let sentBody: unknown;
		let incompleteSource: string | null = null;
		await page.route(EMAIL_ROUTING_SEND_ROUTE, async (route) => {
			sentBody = route.request().postDataJSON();
			incompleteSource = new URL(route.request().url()).searchParams.get(
				"incomplete_source"
			);
			await sendReleased;
			await fulfillApiResult(route, {
				messageId: "<sent@example.com>",
				outcome: "ok",
			});
		});
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.getByRole("button", { name: "Send Test Email" }).click();
		await page.locator("#test-email-from").fill("sender@example.com");
		await page.locator("#test-email-to").fill("recipient@example.com");
		await page.evaluate(() => {
			const arrayBuffer = File.prototype.arrayBuffer;
			File.prototype.arrayBuffer = async function () {
				await new Promise((resolve) => setTimeout(resolve, 200));
				return arrayBuffer.call(this);
			};
		});
		await page.getByLabel("Attachments").setInputFiles({
			buffer: Buffer.from("attachment body"),
			mimeType: "text/plain",
			name: "example.txt",
		});
		const sendButton = page.getByRole("button", { name: "Send Email" });
		await expect.poll(() => sendButton.isDisabled()).toBe(true);
		await page.getByText("example.txt").waitFor();
		await expect.poll(() => sendButton.isEnabled()).toBe(true);
		await sendButton.click();
		await page.keyboard.press("Escape");
		await page.getByRole("heading", { name: "Send test email" }).waitFor();
		await expect
			.poll(() => sentBody)
			.toMatchObject({
				attachments: [
					{
						content: Buffer.from("attachment body").toString("base64"),
						filename: "example.txt",
						type: "text/plain",
					},
				],
			});
		expect(incompleteSource).toBeNull();
		releaseSend?.();
		await expect
			.poll(() =>
				page.getByRole("heading", { name: "Send test email" }).count()
			)
			.toBe(0);
	});

	test("closes and refreshes when an email is captured without a handler", async ({
		expect,
	}) => {
		let listRequests = 0;
		await page.route(EMAIL_ROUTING_DETAIL_ROUTE, async (route) => {
			listRequests++;
			await fulfillApiResult(
				route,
				listRequests === 1
					? []
					: [
							{
								attachments: [],
								events: [
									{
										timestamp: "2026-08-27T00:00:00.000Z",
										type: "unhandled",
									},
								],
								from: "sender@example.com",
								messageId: "<captured-without-handler@example.com>",
								outcome: "exception",
								rawSize: 42,
								receivedAt: "2026-08-27T00:00:00.000Z",
								subject: "Captured without handler",
								to: "recipient@example.com",
							},
						],
				{
					resultInfo: {
						count: listRequests === 1 ? 0 : 1,
						has_more: false,
						per_page: 25,
					},
				}
			);
		});
		await loadWorker();
		await page.route(EMAIL_ROUTING_SEND_ROUTE, async (route) => {
			await route.fulfill({
				body: JSON.stringify({
					errors: [
						{
							code: 10602,
							message: "Worker 'worker-1' does not export an email() handler.",
						},
					],
					messages: [],
					result: null,
					success: false,
				}),
				contentType: "application/json",
				status: 400,
			});
		});
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.getByRole("button", { name: "Send Test Email" }).click();
		await page.locator("#test-email-from").fill("sender@example.com");
		await page.locator("#test-email-to").fill("recipient@example.com");
		await page.getByLabel("Subject").fill("Captured without handler");
		await page.getByRole("button", { name: "Send Email" }).click();

		await page
			.getByText("Worker 'worker-1' does not export an email() handler.")
			.waitFor();
		await expect
			.poll(() =>
				page.getByRole("heading", { name: "Send test email" }).count()
			)
			.toBe(0);
		const emailRow = page.getByRole("button", {
			name: /Captured without handler/,
		});
		await emailRow.waitFor();
		await emailRow
			.getByRole("img", { name: "Email processing exception" })
			.waitFor();
		expect(listRequests).toBeGreaterThan(1);
	});

	test("allows large attachments and cancels pending reads", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail();
		await loadWorker();
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.getByRole("button", { name: "Send Test Email" }).click();
		const attachmentInput = page.getByLabel("Attachments");
		await page.evaluate(() => {
			const arrayBuffer = File.prototype.arrayBuffer;
			File.prototype.arrayBuffer = async function () {
				await new Promise((resolve) => setTimeout(resolve, 200));
				return arrayBuffer.call(this);
			};
		});
		await attachmentInput.setInputFiles({
			buffer: Buffer.from("cancelled attachment"),
			mimeType: "application/octet-stream",
			name: "cancelled-on-close.bin",
		});
		await page.keyboard.press("Escape");
		await page.waitForTimeout(250);
		await page.getByRole("button", { name: "Send Test Email" }).click();
		expect(await page.getByText("cancelled-on-close.bin").count()).toBe(0);

		await attachmentInput.setInputFiles({
			buffer: Buffer.alloc(700 * 1024 + 1),
			mimeType: "application/octet-stream",
			name: "over-legacy-limit.bin",
		});
		await page.getByText("over-legacy-limit.bin").waitFor();
		expect(
			await page.getByText(/Attachments must total less than/).count()
		).toBe(0);
	});

	test("validates dropped .eml files and restores the structured draft", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail();
		await loadWorker();
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.getByRole("button", { name: "Send Test Email" }).click();
		await page.locator("#test-email-from").fill("sender@example.com");
		await page.getByLabel("Subject").fill("Preserved subject");
		await page.getByLabel("Attachments").setInputFiles({
			buffer: Buffer.from("preserved attachment"),
			mimeType: "text/plain",
			name: "preserved.txt",
		});
		await page.getByText("preserved.txt").waitFor();

		const dropZone = page.getByRole("button", { name: /Upload an \.eml file/ });
		await dropZone.evaluate((element) => {
			const transfer = new DataTransfer();
			transfer.items.add(new File(["first"], "first.eml"));
			transfer.items.add(new File(["second"], "second.eml"));
			element.dispatchEvent(
				new DragEvent("drop", {
					bubbles: true,
					cancelable: true,
					dataTransfer: transfer,
				})
			);
		});
		await page.getByText("Select exactly one .eml file.").waitFor();
		expect(await page.locator("#test-email-from").isVisible()).toBe(true);

		await page.getByLabel("Upload .eml file").setInputFiles({
			buffer: Buffer.from("not an email file"),
			mimeType: "text/plain",
			name: "message.txt",
		});
		await page.getByText("Select a file with a .eml extension.").waitFor();

		await dropZone.evaluate((element) => {
			const transfer = new DataTransfer();
			transfer.items.add(
				new File([new Uint8Array(25 * 1024 * 1024 + 1)], "too-large.eml")
			);
			element.dispatchEvent(
				new DragEvent("drop", {
					bubbles: true,
					cancelable: true,
					dataTransfer: transfer,
				})
			);
		});
		await page
			.getByText("Select a .eml file that is 25 MiB or smaller.")
			.waitFor();

		await dropZone.evaluate((element) => {
			const transfer = new DataTransfer();
			transfer.items.add(
				new File(
					["From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nbody"],
					"DROPPED.EML",
					{ type: "application/octet-stream" }
				)
			);
			element.dispatchEvent(
				new DragEvent("drop", {
					bubbles: true,
					cancelable: true,
					dataTransfer: transfer,
				})
			);
		});
		await page.getByText("DROPPED.EML").waitFor();
		expect(await page.locator("#test-email-from").count()).toBe(0);
		expect(await page.getByText("or compose manually").count()).toBe(0);

		await page.getByRole("button", { name: "Remove", exact: true }).click();
		expect(await page.locator("#test-email-from").inputValue()).toBe(
			"sender@example.com"
		);
		expect(await page.getByLabel("Subject").inputValue()).toBe(
			"Preserved subject"
		);
		await page.getByText("preserved.txt").waitFor();
	});

	test("opens the .eml picker from the keyboard", async ({ expect }) => {
		await mockEmailRoutingDetail();
		await loadWorker();
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.getByRole("button", { name: "Send Test Email" }).click();

		const fileChooserPromise = page.waitForEvent("filechooser");
		const dropZone = page.getByRole("button", { name: /Upload an \.eml file/ });
		await dropZone.focus();
		await page.keyboard.press("Enter");
		const fileChooser = await fileChooserPromise;
		await fileChooser.setFiles({
			buffer: Buffer.from(
				"From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nbody"
			),
			mimeType: "message/rfc822",
			name: "KEYBOARD.EML",
		});
		await page.getByText("KEYBOARD.EML").waitFor();
		expect(await page.getByRole("button", { name: "Remove" }).count()).toBe(1);
	});

	test("retries raw sends without saving a structured draft", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail();
		await loadWorker();
		let attempts = 0;
		let listRequests = 0;
		let releaseSuccess: (() => void) | undefined;
		const successReleased = new Promise<void>((resolve) => {
			releaseSuccess = resolve;
		});
		const sentBodies: Buffer[] = [];
		const contentTypes: Array<string | undefined> = [];
		function countListRequest(request: Request): void {
			const url = new URL(request.url());
			if (
				request.method() === "GET" &&
				url.pathname.endsWith("/local/email/routing")
			) {
				listRequests++;
			}
		}
		page.on("request", countListRequest);
		await page.route(EMAIL_ROUTING_SEND_ROUTE, async (route) => {
			attempts++;
			const body = route.request().postDataBuffer();
			if (body) {
				sentBodies.push(body);
			}
			contentTypes.push(route.request().headers()["content-type"]);
			if (attempts === 1) {
				await route.fulfill({
					body: JSON.stringify({
						errors: [{ code: 10600, message: "Temporary raw failure." }],
						messages: [],
						result: null,
						success: false,
					}),
					contentType: "application/json",
					status: 500,
				});
				return;
			}
			await successReleased;
			await fulfillApiResult(route, {
				messageId: "<raw-send@example.com>",
				outcome: "ok",
			});
		});
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		const initialListRequests = listRequests;
		await page.getByRole("button", { name: "Send Test Email" }).click();
		await page.getByLabel("Upload .eml file").setInputFiles({
			buffer: Buffer.from(
				"From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nraw body"
			),
			mimeType: "application/octet-stream",
			name: "retry.eml",
		});
		const sendButton = page.locator('button[type="submit"]');
		await sendButton.click();
		await page.getByText("Temporary raw failure.").waitFor();
		await page.getByText("retry.eml").waitFor();
		await expect.poll(() => sendButton.isEnabled()).toBe(true);

		await page.locator("form").evaluate((form) => {
			form.dispatchEvent(
				new Event("submit", { bubbles: true, cancelable: true })
			);
			form.dispatchEvent(
				new Event("submit", { bubbles: true, cancelable: true })
			);
		});
		await expect.poll(() => attempts).toBe(2);
		await expect.poll(() => sendButton.isDisabled()).toBe(true);
		await page.keyboard.press("Escape");
		await page.getByRole("heading", { name: "Send test email" }).waitFor();
		expect(attempts).toBe(2);
		expect(contentTypes).toEqual(["message/rfc822", "message/rfc822"]);
		expect(sentBodies).toHaveLength(2);
		expect(sentBodies[0]?.equals(sentBodies[1] ?? Buffer.alloc(0))).toBe(true);
		expect(sentBodies[0]?.toString()).toContain("raw body");
		releaseSuccess?.();
		await expect
			.poll(() =>
				page.getByRole("heading", { name: "Send test email" }).count()
			)
			.toBe(0);
		await expect.poll(() => listRequests).toBeGreaterThan(initialListRequests);
		page.off("request", countListRequest);
	});

	test("closes and refreshes after captured handler rejection and exception results", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail();
		await loadWorker();
		let attempts = 0;
		let listRequests = 0;
		function countListRequest(request: Request): void {
			const url = new URL(request.url());
			if (
				request.method() === "GET" &&
				url.pathname.endsWith("/local/email/routing")
			) {
				listRequests++;
			}
		}
		page.on("request", countListRequest);
		await page.route(EMAIL_ROUTING_SEND_ROUTE, async (route) => {
			attempts++;
			await fulfillApiResult(
				route,
				attempts === 1
					? {
							messageId: "<rejected-raw@example.com>",
							outcome: "ok",
							rejectReason: "Mailbox unavailable",
						}
					: {
							messageId: "<exception-raw@example.com>",
							outcome: "exception",
						}
			);
		});
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await expect.poll(() => listRequests).toBeGreaterThan(0);
		const initialListRequests = listRequests;
		await page.getByRole("button", { name: "Send Test Email" }).click();
		await page.getByLabel("Upload .eml file").setInputFiles({
			buffer: Buffer.from(
				"From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nraw body"
			),
			mimeType: "message/rfc822",
			name: "handler-outcome.eml",
		});
		const sendButton = page.locator('button[type="submit"]');
		await sendButton.click();
		await page
			.getByText(
				"The Worker's email() handler rejected the message: Mailbox unavailable"
			)
			.waitFor();
		await expect
			.poll(() =>
				page.getByRole("heading", { name: "Send test email" }).count()
			)
			.toBe(0);
		await expect.poll(() => listRequests).toBeGreaterThan(initialListRequests);

		const afterRejectionListRequests = listRequests;
		await page.getByRole("button", { name: "Send Test Email" }).click();
		await page.getByLabel("Upload .eml file").setInputFiles({
			buffer: Buffer.from(
				"From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nraw body"
			),
			mimeType: "message/rfc822",
			name: "handler-outcome.eml",
		});
		await sendButton.click();
		await page
			.getByText("The Worker's email() handler threw an exception.")
			.waitFor();
		await expect
			.poll(() =>
				page.getByRole("heading", { name: "Send test email" }).count()
			)
			.toBe(0);
		await expect
			.poll(() => listRequests)
			.toBeGreaterThan(afterRejectionListRequests);
		expect(attempts).toBe(2);
		page.off("request", countListRequest);
	});

	test("closes and refreshes after a raw send is captured without an email handler", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail();
		await loadWorker();
		let listRequests = 0;
		function countListRequest(request: Request): void {
			const url = new URL(request.url());
			if (
				request.method() === "GET" &&
				url.pathname.endsWith("/local/email/routing")
			) {
				listRequests++;
			}
		}
		page.on("request", countListRequest);
		await page.route(EMAIL_ROUTING_SEND_ROUTE, async (route) => {
			await route.fulfill({
				body: JSON.stringify({
					errors: [
						{
							code: 10602,
							message: "Worker 'worker-1' does not export an email() handler.",
						},
					],
					messages: [],
					result: null,
					success: false,
				}),
				contentType: "application/json",
				status: 400,
			});
		});
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await expect.poll(() => listRequests).toBeGreaterThan(0);
		const initialListRequests = listRequests;
		await page.getByRole("button", { name: "Send Test Email" }).click();
		await page.getByLabel("Upload .eml file").setInputFiles({
			buffer: Buffer.from(
				"From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nraw body"
			),
			mimeType: "message/rfc822",
			name: "missing-handler.eml",
		});
		await page.locator('button[type="submit"]').click();
		await page
			.getByText("Worker 'worker-1' does not export an email() handler.")
			.waitFor();
		await expect
			.poll(() =>
				page.getByRole("heading", { name: "Send test email" }).count()
			)
			.toBe(0);
		await expect.poll(() => listRequests).toBeGreaterThan(initialListRequests);
		page.off("request", countListRequest);
	});

	test("projects a clicked row into the composer without changing navigation", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail(false, {
			capturedPortion: true,
			showInList: true,
		});
		await loadWorker();
		const projectionRequests: Array<{
			messageId: string | null;
			worker: string | null;
		}> = [];
		let projectedSend:
			| { body: Record<string, unknown>; incompleteSource: string | null }
			| undefined;
		await page.route(EMAIL_ROUTING_RESEND_DRAFT_ROUTE, async (route) => {
			const search = new URL(route.request().url()).searchParams;
			projectionRequests.push({
				messageId: search.get("message_id"),
				worker: search.get("worker"),
			});
			await fulfillApiResult(route, {
				capturedPortion: true,
				draft: {
					attachments: [
						{
							content: Buffer.from("projected attachment").toString("base64"),
							contentId: "projected-file",
							disposition: "inline",
							filename: "projected.txt",
							type: "text/plain",
						},
					],
					bcc: ["must-not-appear@example.com"],
					cc: ["cc-one@example.com", "cc-two@example.com"],
					from: "Projected Sender <sender@example.com>",
					headers: { "X-Projected": "projected value" },
					html: "<p>Projected HTML</p>",
					replyTo: "reply@example.com",
					subject: "Projected subject",
					text: "Projected text",
					to: ["one@example.com", "two@example.com"],
				},
			});
		});
		await page.route(EMAIL_ROUTING_SEND_ROUTE, async (route) => {
			projectedSend = {
				body: route.request().postDataJSON() as Record<string, unknown>,
				incompleteSource: new URL(route.request().url()).searchParams.get(
					"incomplete_source"
				),
			};
			await fulfillApiResult(route, {
				messageId: "<edited-partial@example.com>",
				outcome: "ok",
			});
		});
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);

		const editButton = page.getByRole("button", { name: "Edit and resend" });
		await editButton.waitFor();
		expect(await editButton.count()).toBe(1);
		expect(
			await page.getByRole("button", { name: "Resend", exact: true }).count()
		).toBe(1);
		await editButton.click();
		await page.getByRole("heading", { name: "Send test email" }).waitFor();
		expect(new URL(page.url()).pathname).toMatch(/\/email\/routing$/);
		expect(projectionRequests).toEqual([
			{ messageId: "<test-email-id>", worker: "worker-1" },
		]);
		expect(await page.locator("#test-email-from").inputValue()).toBe(
			"Projected Sender <sender@example.com>"
		);
		expect(await page.locator("#test-email-to").inputValue()).toBe(
			"one@example.com, two@example.com"
		);
		expect(await page.getByLabel("Cc").inputValue()).toBe(
			"cc-one@example.com, cc-two@example.com"
		);
		expect(await page.getByLabel("Reply-To").inputValue()).toBe(
			"reply@example.com"
		);
		expect(await page.getByLabel("Subject").inputValue()).toBe(
			"Projected subject"
		);
		expect(await page.getByLabel("Text body").inputValue()).toBe(
			"Projected text"
		);
		expect(await page.getByLabel("HTML body").inputValue()).toBe(
			"<p>Projected HTML</p>"
		);
		expect(await page.getByLabel("Header 1 name").inputValue()).toBe(
			"X-Projected"
		);
		expect(await page.getByText("projected.txt").count()).toBe(1);
		expect(await page.getByText("text/plain · 20 B").count()).toBe(1);
		expect(await page.getByLabel("Bcc").count()).toBe(0);
		await page
			.getByText("Only the captured portion of this email is available.")
			.waitFor();
		await page.getByRole("button", { name: "Send Email" }).click();
		await expect.poll(() => projectedSend).toBeDefined();
		expect(projectedSend).toMatchObject({
			body: { subject: "Projected subject" },
			incompleteSource: "true",
		});
		expect(projectedSend?.body).not.toHaveProperty("bcc");
		await expect
			.poll(() =>
				page.getByRole("heading", { name: "Send test email" }).count()
			)
			.toBe(0);
		await page.getByRole("button", { name: /Test email/ }).click();
		await expect
			.poll(() => new URL(page.url()).pathname)
			.toMatch(/\/email\/routing\/[^/]+$/);
	});

	test("keeps unavailable edit actions focusable with an explanation", async ({
		expect,
	}) => {
		const reason =
			"Emails sent from uploaded .eml files cannot be edited and resent.";
		await mockEmailRoutingDetail(false, {
			editAndResendAvailable: false,
			editAndResendUnavailableReason: reason,
			showInList: true,
		});
		await loadWorker();
		let projectionRequests = 0;
		await page.route(EMAIL_ROUTING_RESEND_DRAFT_ROUTE, async (route) => {
			projectionRequests++;
			await fulfillApiResult(route, null);
		});
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);

		const editButton = page.getByRole("button", { name: "Edit and resend" });
		expect(await editButton.getAttribute("disabled")).toBeNull();
		expect(await editButton.getAttribute("aria-disabled")).toBe("true");
		await editButton.hover();
		await page.getByText(reason).waitFor();
		await editButton.focus();
		expect(
			await editButton.evaluate((element) => element === document.activeElement)
		).toBe(true);
		await editButton.evaluate((button) => {
			(button as HTMLElement).click();
		});
		expect(projectionRequests).toBe(0);
		expect(new URL(page.url()).pathname).toMatch(/\/email\/routing$/);
	});

	test("deduplicates immediate resend, reports outcomes, and refreshes after settle", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail(false, {
			capturedPortion: true,
			showInList: true,
		});
		await loadWorker();
		let attempts = 0;
		let listRequests = 0;
		let releaseFirst: (() => void) | undefined;
		const firstReleased = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		function countListRequest(request: Request): void {
			const url = new URL(request.url());
			if (
				request.method() === "GET" &&
				url.pathname.endsWith("/local/email/routing")
			) {
				listRequests++;
			}
		}
		page.on("request", countListRequest);
		await page.route(EMAIL_ROUTING_RESEND_ROUTE, async (route) => {
			attempts++;
			if (attempts === 1) {
				await firstReleased;
				await fulfillApiResult(route, {
					capturedPortion: true,
					messageId: "<partial-resend@example.com>",
					outcome: "ok",
				});
				return;
			}
			if (attempts === 2) {
				await fulfillApiResult(route, {
					capturedPortion: false,
					messageId: "<rejected-resend@example.com>",
					outcome: "ok",
					rejectReason: "Mailbox unavailable",
				});
				return;
			}
			if (attempts === 3) {
				await fulfillApiResult(route, {
					capturedPortion: false,
					messageId: "<exception-resend@example.com>",
					outcome: "exception",
				});
				return;
			}
			await route.fulfill({
				body: JSON.stringify({
					errors: [{ code: 10603, message: "Source email was not found." }],
					messages: [],
					result: null,
					success: false,
				}),
				contentType: "application/json",
				status: 404,
			});
		});
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await expect.poll(() => listRequests).toBeGreaterThan(0);
		const initialListRequests = listRequests;
		const resendButton = page.getByRole("button", {
			name: "Resend",
			exact: true,
		});
		await resendButton.evaluate((button) => {
			(button as HTMLElement).click();
			(button as HTMLElement).click();
		});
		await expect.poll(() => attempts).toBe(1);
		await expect.poll(() => resendButton.isDisabled()).toBe(true);
		expect(await resendButton.getAttribute("aria-busy")).toBe("true");
		expect(new URL(page.url()).pathname).toMatch(/\/email\/routing$/);
		releaseFirst?.();
		await page.getByText("Captured portion resent.").waitFor();
		await page
			.getByText("Only the portion retained by local capture was available")
			.waitFor();
		await expect.poll(() => listRequests).toBeGreaterThan(initialListRequests);

		await expect.poll(() => resendButton.isEnabled()).toBe(true);
		await resendButton.click();
		await page
			.getByText("The Worker's email() handler rejected the resent email.")
			.waitFor();
		await page.getByText("Mailbox unavailable").waitFor();
		await expect.poll(() => resendButton.isEnabled()).toBe(true);
		await resendButton.click();
		await page
			.getByText(
				"The Worker's email() handler threw while processing the resent email."
			)
			.waitFor();
		await expect.poll(() => resendButton.isEnabled()).toBe(true);
		await resendButton.click();
		await page.getByText("Source email was not found.").waitFor();
		expect(attempts).toBe(4);
		page.off("request", countListRequest);
	});

	test("reports composer validation errors accessibly and rejects managed headers", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail();
		await loadWorker();
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.getByRole("button", { name: "Send Test Email" }).click();
		await page.getByRole("heading", { name: "Send test email" }).waitFor();
		const fromInput = page.locator("#test-email-from");
		const toInput = page.locator("#test-email-to");
		expect(await fromInput.getAttribute("required")).not.toBeNull();
		expect(await toInput.getAttribute("required")).not.toBeNull();
		expect(
			await page.locator('label[for="test-email-from"]').textContent()
		).toContain("From *");
		expect(
			await page.locator('label[for="test-email-to"]').textContent()
		).toContain("To *");
		expect(await page.getByText("(optional)", { exact: true }).count()).toBe(0);
		await page.getByRole("button", { name: "Send Email" }).click();
		await page
			.getByText("A sender address is required.", { exact: true })
			.waitFor();
		await page
			.getByText("At least one recipient is required.", { exact: true })
			.waitFor();
		expect(await fromInput.getAttribute("aria-invalid")).toBe("true");
		expect(await toInput.getAttribute("aria-invalid")).toBe("true");
		const fromErrorId = await fromInput.getAttribute("aria-describedby");
		const toErrorId = await toInput.getAttribute("aria-describedby");
		expect(fromErrorId).toBeTruthy();
		expect(toErrorId).toBeTruthy();
		expect(await page.locator(`[id="${fromErrorId}"]`).textContent()).toContain(
			"A sender address is required."
		);
		expect(await page.locator(`[id="${toErrorId}"]`).textContent()).toContain(
			"At least one recipient is required."
		);

		await fromInput.fill("sender@example.com");
		await toInput.fill("recipient@example.com");
		expect(
			await page
				.getByText("A sender address is required.", { exact: true })
				.count()
		).toBe(0);
		expect(
			await page
				.getByText("At least one recipient is required.", { exact: true })
				.count()
		).toBe(0);
		await page.getByRole("button", { name: "Add header" }).click();
		const headersInput = page.getByLabel("Header 1 name");
		const headerValueInput = page.getByLabel("Header 1 value");
		expect(await page.getByText("Header 1", { exact: true }).count()).toBe(0);
		expect(
			await headerValueInput.evaluate(
				(element) => window.getComputedStyle(element).resize
			)
		).toBe("none");
		const dialog = page.getByRole("dialog", { name: "Send test email" });
		const dialogWidthBeforeError = await dialog.evaluate(
			(element) => element.getBoundingClientRect().width
		);
		await headersInput.fill("message-id");
		await headerValueInput.fill("custom-message-id@example.com");
		await page.getByRole("button", { name: "Send Email" }).click();

		const headersError = page.getByText(/is managed by the email composer/);
		await headersError.waitFor();
		expect(await headersError.count()).toBe(1);
		expect(
			await dialog.evaluate((element) => element.getBoundingClientRect().width)
		).toBe(dialogWidthBeforeError);
		expect(await headersInput.getAttribute("aria-invalid")).toBe("true");
		const headersErrorId = await headersInput.getAttribute("aria-describedby");
		expect(headersErrorId).toBeTruthy();
		expect(await page.locator(`[id="${headersErrorId}"]`).textContent()).toBe(
			"message-id is managed by the email composer and cannot be overridden."
		);
		await headersInput.fill("X-Custom-Header");
		expect(await headersError.count()).toBe(0);
		expect(await headersInput.getAttribute("aria-invalid")).toBeNull();
	});

	test("preserves the current email page after a pagination failure and retries", async ({
		expect,
	}) => {
		let failNextPage = true;
		await page.route(EMAIL_ROUTING_DETAIL_ROUTE, async (route) => {
			const cursor = new URL(route.request().url()).searchParams.get("cursor");
			if (cursor && failNextPage) {
				failNextPage = false;
				await route.fulfill({ status: 500, body: "Pagination failed" });
				return;
			}
			const pageNumber = cursor ? 2 : 1;
			await fulfillApiResult(
				route,
				[
					{
						attachments: [],
						from: `sender-${pageNumber}@example.com`,
						messageId: `<page-${pageNumber}@example.com>`,
						rawSize: 4,
						receivedAt: "2026-08-24T00:00:00.000Z",
						subject: `Page ${pageNumber}`,
						to: "recipient@example.com",
					},
				],
				{
					resultInfo: {
						count: 1,
						cursor: cursor ? undefined : "next-page",
						has_more: !cursor,
						per_page: 10,
					},
				}
			);
		});
		await loadWorker();
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.getByText("Page 1", { exact: true }).waitFor();

		await page.getByRole("button", { name: "Next page" }).click();
		await page.getByRole("alert").waitFor();
		await page.getByText("Page 1", { exact: true }).waitFor();

		await page.getByRole("button", { name: "Next page" }).click();
		await page.getByText("Page 2", { exact: true }).waitFor();
		expect(await page.getByRole("alert").count()).toBe(0);
	});

	test("explains the email handler requirement and toggles received raw content", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail(false);
		await loadWorker();
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page
			.getByText(
				/Email capture only works when the selected Worker has an email\(\) handler configured\./
			)
			.waitFor();

		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing/test-email-id?worker=worker-1",
				viteUrl
			).toString()
		);
		const contentButton = page.getByRole("button", { name: /^Content/ });
		expect(await contentButton.getAttribute("aria-expanded")).toBe("false");
		await contentButton.click();
		const htmlButton = page.getByRole("button", {
			name: "Preview",
			exact: true,
		});
		const rawButton = page.getByRole("button", {
			name: "HTML source",
			exact: true,
		});
		await htmlButton.waitFor();
		expect(await htmlButton.getAttribute("aria-pressed")).toBe("true");
		expect(await rawButton.getAttribute("aria-pressed")).toBe("false");
		await page
			.locator('iframe[title="Rendered received HTML email body"]')
			.waitFor();

		const headersButton = page.getByRole("button", {
			name: /Email headers/,
		});
		expect(await headersButton.textContent()).toContain("1 header");
		expect(await headersButton.getAttribute("aria-expanded")).toBe("false");
		expect(await page.getByText("X-Test-Header", { exact: true }).count()).toBe(
			0
		);
		await headersButton.click();
		expect(await headersButton.getAttribute("aria-expanded")).toBe("true");
		const headersPanel = page.getByTestId("received-email-headers-panel");
		await headersPanel.getByText("X-Test-Header", { exact: true }).waitFor();
		for (const structuredHeader of ["From", "Message-ID", "Subject", "To"]) {
			expect(
				await headersPanel.getByText(structuredHeader, { exact: true }).count()
			).toBe(0);
		}
		const multilineHeaderValue = headersPanel
			.locator("dd")
			.filter({ hasText: "first line" });
		await multilineHeaderValue.waitFor();
		expect(await multilineHeaderValue.textContent()).toBe(
			"first line\nsecond line"
		);
		await page.getByText("test-email-id", { exact: true }).waitFor();
		expect(
			await page.getByText("<test-email-id>", { exact: true }).count()
		).toBe(0);

		await rawButton.click();
		expect(await htmlButton.getAttribute("aria-pressed")).toBe("false");
		expect(await rawButton.getAttribute("aria-pressed")).toBe("true");
		await page
			.locator("pre")
			.filter({
				hasText: "<p>Rendered received HTML body</p>",
			})
			.waitFor();
		const contentPanel = page.getByTestId("received-email-content-panel");
		await contentPanel.getByRole("heading", { name: "Raw MIME" }).waitFor();
		await contentPanel.getByText(/Content-Type: text\/plain/).waitFor();
		expect(
			await page
				.locator('iframe[title="Rendered received HTML email body"]')
				.count()
		).toBe(0);
	});

	test("shows handler exceptions and truncated replies as message diagnostics", async () => {
		await mockEmailRoutingDetail(false, {
			handlerException: true,
			replyTruncated: true,
		});
		await loadWorker();
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		const emailRow = page.getByRole("button", { name: /Test email/ });
		await emailRow
			.getByRole("img", { name: "Email processing exception" })
			.waitFor();
		await emailRow.click();

		await page
			.getByRole("alert")
			.getByText(/email\(\) handler threw an exception/)
			.waitFor();
		await page
			.getByText(/Reply content was truncated during local capture/)
			.waitFor();
	});
});
