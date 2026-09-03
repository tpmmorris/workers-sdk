import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "vitest";
import { isBuild, page, rootDir, viteTestUrl } from "../../../__test-utils__";
import { runBaseTests } from "../base-tests";

function fixtureUrl(pathname: string): string {
	return new URL(pathname, viteTestUrl).href;
}

runBaseTests();

test("loads generated client modules beneath the Vite base", async ({
	expect,
}) => {
	const moduleScripts = page.locator('script[type="module"][src]');
	const moduleCount = await moduleScripts.count();
	expect(moduleCount).toBeGreaterThan(0);

	for (let index = 0; index < moduleCount; index++) {
		const moduleUrl = await moduleScripts.nth(index).getAttribute("src");
		expect(moduleUrl).toMatch(/^\/docs\//);
		const response = await fetch(fixtureUrl(moduleUrl ?? "/missing"));
		expect(response.status).toBe(200);
	}
});

test("serves direct assets only beneath the Vite base", async ({ expect }) => {
	const prefixedResponse = await fetch(fixtureUrl("/docs/marker.txt"));
	expect(prefixedResponse.status).toBe(200);
	expect(await prefixedResponse.text()).toBe("marker\n");

	expect((await fetch(fixtureUrl("/marker.txt"))).status).toBe(404);
});

test("serves Worker API routes beneath the Vite base", async ({ expect }) => {
	const response = await fetch(fixtureUrl("/docs/api/"));
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ name: "Cloudflare" });
});

test("fetches a mounted asset through the assets binding", async ({
	expect,
}) => {
	const response = await fetch(fixtureUrl("/docs/api/asset"));

	expect(response.status).toBe(200);
	expect(await response.text()).toBe("Modified: Asset content.\n");
});

test.runIf(isBuild)("canonicalizes the base root", async ({ expect }) => {
	const response = await fetch(fixtureUrl("/docs"), { redirect: "manual" });
	expect(response.status).toBe(307);
	expect(response.headers.get("location")).toBe("/docs/");
});

test("applies redirects and headers using public base-path URLs", async ({
	expect,
}) => {
	const response = await fetch(fixtureUrl("/docs/legacy"), {
		redirect: "manual",
	});
	expect(response.status).toBe(302);
	expect(response.headers.get("location")).toBe("/docs/target.txt");
	expect(response.headers.get("x-base-path")).toBe("active");
});

// Vite dev serves exact public assets before invoking the Worker. Build preview
// exercises the production Asset Worker path where static headers and rewrites
// are applied.
test.runIf(isBuild)("applies headers to a direct asset", async ({ expect }) => {
	const response = await fetch(fixtureUrl("/docs/marker.txt"));
	expect(response.headers.get("x-base-path")).toBe("active");
});

test.runIf(isBuild)("applies an asset rewrite", async ({ expect }) => {
	const response = await fetch(fixtureUrl("/docs/rewrite"));
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("target\n");
});

test.runIf(isBuild)("emits the inherited Vite base", ({ expect }) => {
	const config = JSON.parse(
		fs.readFileSync(
			path.join(rootDir, "dist", "worker", "wrangler.json"),
			"utf8"
		)
	) as { assets?: { base_path?: string } };

	expect(config.assets?.base_path).toBe("/docs/");
});
