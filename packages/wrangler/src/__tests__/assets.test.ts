import * as fs from "node:fs";
import * as path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	NonDirectoryAssetsDirError,
	NonExistentAssetsDirError,
	getAssetsOptions,
} from "../assets";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Creates a minimal Config object sufficient for `getAssetsOptions`.
 * Only the fields actually read by the function need to be populated.
 */
function makeConfig(
	overrides: Partial<{
		assets: NonNullable<Config["assets"]>;
		main: string;
		configPath: string;
	}> = {}
): Config {
	return {
		assets: undefined,
		main: undefined,
		configPath: undefined,
		compatibility_date: "2026-04-29",
		compatibility_flags: [],
		...overrides,
	} as unknown as Config;
}

describe("getAssetsOptions", () => {
	runInTempDir();

	describe("validateDirectoryExistence: true (default — deploy path)", () => {
		it("throws NonExistentAssetsDirError when the --assets directory does not exist", ({
			expect,
		}) => {
			expect(() =>
				getAssetsOptions({
					args: { assets: "dist" },
					config: makeConfig(),
					validateDirectoryExistence: true,
				})
			).toThrow(NonExistentAssetsDirError);
		});

		it("throws with a message referencing the CLI flag when --assets is used", ({
			expect,
		}) => {
			expect(() =>
				getAssetsOptions({
					args: { assets: "dist" },
					config: makeConfig(),
					validateDirectoryExistence: true,
				})
			).toThrow(
				/The directory specified by the "--assets" command line argument does not exist/
			);
		});

		it("throws with a message referencing the config file when assets.directory is used", ({
			expect,
		}) => {
			expect(() =>
				getAssetsOptions({
					args: { assets: undefined },
					config: makeConfig({ assets: { directory: "dist" } }),
					validateDirectoryExistence: true,
				})
			).toThrow(
				/The directory specified by the "assets.directory" field in your configuration file does not exist/
			);
		});

		it("throws NonDirectoryAssetsDirError when the path points to a file, not a directory", ({
			expect,
		}) => {
			fs.writeFileSync("not-a-dir.txt", "");
			expect(() =>
				getAssetsOptions({
					args: { assets: "not-a-dir.txt" },
					config: makeConfig(),
					validateDirectoryExistence: true,
				})
			).toThrow(NonDirectoryAssetsDirError);
		});
	});

	describe("validateDirectoryExistence: false (getPlatformProxy / unstable_getMiniflareWorkerOptions path)", () => {
		it("does NOT throw when the assets directory does not exist", ({
			expect,
		}) => {
			expect(() =>
				getAssetsOptions({
					args: { assets: "dist" },
					config: makeConfig(),
					validateDirectoryExistence: false,
				})
			).not.toThrow();
		});

		it("returns a valid AssetsOptions object even when the directory is absent", ({
			expect,
		}) => {
			const result = getAssetsOptions({
				args: { assets: "dist" },
				config: makeConfig(),
				validateDirectoryExistence: false,
			});

			expect(result).toBeDefined();
			expect(result?.directory).toBe(path.resolve(process.cwd(), "dist"));
			// No _redirects / _headers since the directory doesn't exist
			expect(result?._redirects).toBeUndefined();
			expect(result?._headers).toBeUndefined();
		});

		it("merges nested assetConfig overrides without losing resolved defaults", ({
			expect,
		}) => {
			const result = getAssetsOptions({
				args: { assets: undefined },
				config: makeConfig({
					assets: {
						directory: "dist",
						html_handling: "force-trailing-slash",
						base_path: "/original",
					},
				}),
				validateDirectoryExistence: false,
				overrides: {
					assetConfig: { base_path: "/subpath" },
				},
			});

			expect(result?.assetConfig).toMatchObject({
				html_handling: "force-trailing-slash",
				base_path: "/subpath",
			});
		});

		it("preserves a relative base_path override for the Asset Worker", ({
			expect,
		}) => {
			const result = getAssetsOptions({
				args: { assets: undefined },
				config: makeConfig({
					assets: {
						directory: "dist",
					},
				}),
				validateDirectoryExistence: false,
				overrides: {
					assetConfig: { base_path: "relative/path" },
				},
			});

			expect(result?.assetConfig.base_path).toBe("relative/path");
		});

		it("preserves an invalid base_path override for Asset Worker validation", ({
			expect,
		}) => {
			const result = getAssetsOptions({
				args: { assets: undefined },
				config: makeConfig({ assets: { directory: "dist" } }),
				validateDirectoryExistence: false,
				overrides: {
					assetConfig: { base_path: "https://example.com/assets" },
				},
			});

			expect(result?.assetConfig.base_path).toBe(
				"https://example.com/assets"
			);
		});

		it("still throws NonDirectoryAssetsDirError when the path points to a file", ({
			expect,
		}) => {
			fs.writeFileSync("not-a-dir.txt", "");
			expect(() =>
				getAssetsOptions({
					args: { assets: "not-a-dir.txt" },
					config: makeConfig(),
					validateDirectoryExistence: false,
				})
			).toThrow(NonDirectoryAssetsDirError);
		});

		it("returns correct options when the directory exists and has files", ({
			expect,
		}) => {
			fs.mkdirSync("dist");
			fs.writeFileSync(path.join("dist", "_redirects"), "/old /new 301");

			const result = getAssetsOptions({
				args: { assets: "dist" },
				config: makeConfig(),
				validateDirectoryExistence: false,
			});

			expect(result?.directory).toBe(path.resolve(process.cwd(), "dist"));
			expect(result?._redirects).toContain("/old /new 301");
		});

		it("works with assets from config rather than the CLI flag", ({
			expect,
		}) => {
			const result = getAssetsOptions({
				args: { assets: undefined },
				config: makeConfig({ assets: { directory: "nonexistent-dir" } }),
				validateDirectoryExistence: false,
			});

			expect(result).toBeDefined();
			expect(result?.directory).toContain("nonexistent-dir");
		});

		it("returns undefined when no assets are configured", ({ expect }) => {
			const result = getAssetsOptions({
				args: { assets: undefined },
				config: makeConfig(),
				validateDirectoryExistence: false,
			});

			expect(result).toBeUndefined();
		});
	});
});
