import { describe, test } from "vitest";
import {
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
