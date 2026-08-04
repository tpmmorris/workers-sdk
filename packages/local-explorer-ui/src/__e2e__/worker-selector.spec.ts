import { afterEach, describe, test } from "vitest";
import { page, viteUrl } from "./utils";

const WORKERS_ROUTE = "**/cdn-cgi/explorer/api/local/workers";
const EMAIL_ROUTING_DETAIL_ROUTE =
	"**/cdn-cgi/explorer/api/email/routing/test-email-id*";

function createWorkers(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		isSelf: index === 0,
		name: `worker-${index + 1}`,
	}));
}

async function loadWorkers(count: number): Promise<void> {
	await page.route(WORKERS_ROUTE, async (route) => {
		await route.fulfill({
			contentType: "application/json",
			body: JSON.stringify({
				errors: [],
				messages: [],
				result: createWorkers(count),
				success: true,
			}),
		});
	});

	await page.goto(viteUrl);
}

function waitForWorkersResponse() {
	return page.waitForResponse((response) =>
		response.url().endsWith("/cdn-cgi/local/explorer/api/local/workers")
	);
}

async function mockEmailRoutingDetail(): Promise<void> {
	await page.route(EMAIL_ROUTING_DETAIL_ROUTE, async (route) => {
		await route.fulfill({
			contentType: "application/json",
			body: JSON.stringify({
				errors: [],
				messages: [],
				result: {
					messageId: "<test-email-id>",
					from: "sender@example.com",
					to: "recipient@example.com",
					subject: "Test email",
					receivedAt: "2024-01-01T00:00:00.000Z",
					rawSize: 42,
					attachments: [],
					events: [],
					forwards: [],
					replies: [],
				},
				success: true,
			}),
		});
	});
}

afterEach(async () => {
	await page.unroute(WORKERS_ROUTE);
	await page.unroute(EMAIL_ROUTING_DETAIL_ROUTE);
});

describe("worker selector", () => {
	test("stays hidden when there is only one worker", async ({ expect }) => {
		await loadWorkers(1);

		expect(await page.getByRole("combobox").count()).toBe(0);
	});

	test("keeps nine workers fully visible", async ({ expect }) => {
		await loadWorkers(9);

		await page.getByRole("combobox").click();
		const listBounds = await page.getByRole("listbox").boundingBox();
		const lastOptionBounds = await page
			.getByRole("option", { name: "worker-9" })
			.boundingBox();

		expect(listBounds).not.toBeNull();
		expect(lastOptionBounds).not.toBeNull();
		if (listBounds && lastOptionBounds) {
			expect(lastOptionBounds.y + lastOptionBounds.height).toBeLessThanOrEqual(
				listBounds.y + listBounds.height
			);
		}
	});

	test("scrolls to and selects workers beyond the visible limit", async ({
		expect,
	}) => {
		await page.setViewportSize({ height: 720, width: 1280 });
		await loadWorkers(12);

		await page.getByRole("combobox").click();
		const list = page.getByRole("listbox");

		const dimensions = await list.evaluate((element) => ({
			clientHeight: element.clientHeight,
			scrollHeight: element.scrollHeight,
		}));
		expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

		const main = page.locator("main");
		const pageScrollTop = await main.evaluate((element) => element.scrollTop);
		await list.hover();
		await page.mouse.wheel(0, dimensions.scrollHeight);
		await expect
			.poll(async () => await list.evaluate((element) => element.scrollTop))
			.toBeGreaterThan(0);
		expect(await main.evaluate((element) => element.scrollTop)).toBe(
			pageScrollTop
		);

		const workersResponse = waitForWorkersResponse();
		await page.getByRole("option", { name: "worker-12" }).click();
		await workersResponse;
		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-12");
		await page.getByRole("combobox").getByText("worker-12").waitFor();
		await page.waitForLoadState("networkidle");
	});

	test("reaches later workers with the keyboard in a narrow viewport", async ({
		expect,
	}) => {
		await loadWorkers(12);
		await page.setViewportSize({ height: 640, width: 800 });

		await page.getByRole("combobox").click({ timeout: 5_000 });
		const list = page.getByRole("listbox");
		const lastOption = page.getByRole("option", { name: "worker-12" });
		let reachedLastOption = false;
		for (let index = 0; index < 12; index++) {
			await page.keyboard.press("ArrowDown");
			reachedLastOption =
				(await lastOption.getAttribute("data-highlighted")) !== null;
			if (reachedLastOption) {
				break;
			}
		}
		expect(reachedLastOption).toBe(true);
		expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(
			0
		);
		const workersResponse = waitForWorkersResponse();
		await page.keyboard.press("Enter");
		await workersResponse;

		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-12");
		await page.getByRole("combobox").getByText("worker-12").waitFor();
		await page.waitForLoadState("networkidle");
	});

	test("returns to the routing list when switching workers on the email detail page", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail();
		await loadWorkers(2);
		await page.goto(
			new URL(
				"/cdn-cgi/explorer/email/routing/test-email-id?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.waitForLoadState("networkidle");

		const workersResponse = waitForWorkersResponse();
		await page.getByRole("combobox").click();
		await page.getByRole("option", { name: "worker-2" }).click();
		await workersResponse;

		// Switching workers on the detail page redirects back to the parent
		// "Routing" list, carrying the newly selected worker forward.
		await expect
			.poll(() => new URL(page.url()).pathname)
			.toMatch(/\/email\/routing$/);
		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-2");
	});
});
