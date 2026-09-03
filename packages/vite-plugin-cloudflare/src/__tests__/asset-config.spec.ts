import { describe, test } from "vitest";
import {
	getAssetsBasePathWarning,
	getAssetsConfig,
	inheritAssetsBasePath,
	resolveAssetsBasePath,
} from "../asset-config";
import type { AssetsOnlyResolvedConfig } from "../plugin-config";
import type { ParsedInputWorkerConfig } from "@cloudflare/config";
import type * as vite from "vite";

describe("getAssetsConfig", () => {
	function resolvedPluginConfig(basePath?: string): AssetsOnlyResolvedConfig {
		return {
			type: "assets-only",
			config: {
				assets: basePath === undefined ? {} : { base_path: basePath },
			},
		} as AssetsOnlyResolvedConfig;
	}

	function resolvedViteConfig(base: string): vite.ResolvedConfig {
		return {
			base,
		} as unknown as vite.ResolvedConfig;
	}

	test("inherits assets.base_path from the resolved Vite base", ({
		expect,
	}) => {
		const config = getAssetsConfig(
			resolvedPluginConfig(),
			undefined,
			resolvedViteConfig("/app/")
		);

		expect(config.base_path).toBe("/app/");
	});

	test("decodes the final resolved Vite base", ({ expect }) => {
		const config = getAssetsConfig(
			resolvedPluginConfig(),
			undefined,
			resolvedViteConfig("/caf%C3%A9/")
		);

		expect(config.base_path).toBe("/café/");
	});

	test("prefers an explicit assets.base_path over the Vite base", ({
		expect,
	}) => {
		const config = getAssetsConfig(
			resolvedPluginConfig("/assets"),
			undefined,
			resolvedViteConfig("/vite/")
		);

		expect(config.base_path).toBe("/assets");
	});

	for (const base of [
		"./app",
		"//cdn.example.com/app/",
		"https://example.com/app/",
	]) {
		test(`does not inherit an incompatible Vite base: ${base}`, ({
			expect,
		}) => {
			const config = getAssetsConfig(
				resolvedPluginConfig(),
				undefined,
				resolvedViteConfig(base)
			);

			expect(config.base_path).toBeUndefined();
		});
	}

	test("preserves an inherited pathname for Asset Worker validation", ({
		expect,
	}) => {
		expect(resolveAssetsBasePath(undefined, { base: "/app%2Fadmin/" })).toBe(
			"/app%2Fadmin/"
		);
	});

	test("preserves an explicit relative base_path for the Asset Worker", ({
		expect,
	}) => {
		const config = getAssetsConfig(
			resolvedPluginConfig("./assets"),
			undefined,
			resolvedViteConfig("/vite/")
		);

		expect(config.base_path).toBe("./assets");
	});

	test("preserves an invalid explicit base_path for Asset Worker validation", ({
		expect,
	}) => {
		const config = getAssetsConfig(
			resolvedPluginConfig("https://example.com/assets"),
			undefined,
			resolvedViteConfig("/vite/")
		);

		expect(config.base_path).toBe("https://example.com/assets");
	});

	test("applies inheritance to Build Output worker configuration", ({
		expect,
	}) => {
		const config = {
			type: "worker",
			name: "worker",
			compatibilityDate: "2026-08-20",
			assets: {},
		} satisfies ParsedInputWorkerConfig;

		expect(
			inheritAssetsBasePath(config, resolvedViteConfig("/app/")).assets
				?.basePath
		).toBe("/app/");
	});

	test("does not add assets to a Build Output worker without them", ({
		expect,
	}) => {
		const config = {
			type: "worker",
			name: "worker",
			compatibilityDate: "2026-08-20",
		} satisfies ParsedInputWorkerConfig;

		expect(
			inheritAssetsBasePath(config, resolvedViteConfig("/app/")).assets
		).toBeUndefined();
	});
});

describe("getAssetsBasePathWarning", () => {
	test.for([
		"./app",
		"app/",
		"//cdn.example.com/app/",
		"https://example.com/app/",
	])("warns when the Vite base cannot be inherited: %s", (base, { expect }) => {
		expect(getAssetsBasePathWarning(undefined, { base })).toBe(
			`The resolved Vite base "${base}" is not a root-relative path, so it cannot be used as assets.base_path. Set assets.base_path explicitly if the application should be served from a subpath.`
		);
	});

	test("warns when a root-relative Vite base is invalid", ({ expect }) => {
		expect(getAssetsBasePathWarning(undefined, { base: "/app%2Fadmin/" })).toBe(
			'The resolved Vite base "/app%2Fadmin/" could not be converted to a valid assets.base_path. Set assets.base_path explicitly to a valid pathname.'
		);
	});

	test("warns when an explicit base path conflicts with the Vite base", ({
		expect,
	}) => {
		expect(getAssetsBasePathWarning("/assets", { base: "/app/" })).toBe(
			'The explicit assets.base_path "/assets" overrides the resolved Vite base "/app/". Ensure the two paths intentionally differ, otherwise generated asset URLs may not resolve.'
		);
	});

	test.for([
		{ basePath: undefined, viteBase: "/app/" },
		{ basePath: "/app", viteBase: "/app/" },
		{ basePath: "./app", viteBase: "/app/" },
		{ basePath: "/assets", viteBase: "https://example.com/app/" },
		{ basePath: "https://example.com/assets", viteBase: "/app/" },
	])(
		"does not warn for compatible or independently validated values: $basePath and $viteBase",
		({ basePath, viteBase }, { expect }) => {
			expect(
				getAssetsBasePathWarning(basePath, { base: viteBase })
			).toBeUndefined();
		}
	);
});
