import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { describe, onTestFinished, test } from "vitest";
import { getOutputConfig } from "../plugins/output-config";
import type { ResolvedWorkerConfig } from "../plugin-config";
import type * as vite from "vite";

describe("getWorkerOutputConfig", () => {
	function createRoot() {
		const tempRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "vite-output-config-")
		);
		onTestFinished(() => removeDirSync(tempRoot));
		return tempRoot;
	}

	function resolvedViteConfig(root: string, base = "/"): vite.ResolvedConfig {
		return {
			root,
			base,
			environments: {
				client: {
					build: { outDir: "dist/client" },
				},
			},
		} as unknown as vite.ResolvedConfig;
	}

	function workerConfig(
		root: string,
		overrides: Partial<ResolvedWorkerConfig> = {}
	): ResolvedWorkerConfig {
		return {
			name: "api-worker",
			topLevelName: "api-worker",
			main: "src/index.ts",
			compatibility_date: "2026-06-01",
			compatibility_flags: [],
			configPath: path.join(root, "workers/api/wrangler.jsonc"),
			assets: undefined,
			d1_databases: [],
			...overrides,
		} as ResolvedWorkerConfig;
	}

	test("builds the generated Worker config and rewrites D1 migration paths", ({
		expect,
	}) => {
		const root = createRoot();

		const outputConfig = getOutputConfig({
			inputWorkerConfig: workerConfig(root, {
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "db-id",
						migrations_pattern: "migrations/*/migration.sql",
					},
				],
			}),
			workerOutputDirectory: "dist/api_worker",
			resolvedViteConfig: resolvedViteConfig(root),
			entryFileName: "index.js",
			includeAssets: false,
		});

		expect(outputConfig).toMatchObject({
			name: "api-worker",
			main: "index.js",
			no_bundle: true,
			rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
			assets: undefined,
			d1_databases: [
				{
					binding: "DATABASE",
					database_name: "db",
					database_id: "db-id",
					migrations_dir: "../../workers/api/migrations",
					migrations_pattern: "../../workers/api/migrations/*/migration.sql",
				},
			],
		});
	});

	test("uses the Vite root when the Worker config has no configPath", ({
		expect,
	}) => {
		const root = createRoot();

		const outputConfig = getOutputConfig({
			inputWorkerConfig: workerConfig(root, {
				configPath: undefined,
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "db-id",
					},
				],
			}),
			workerOutputDirectory: "dist/api_worker",
			resolvedViteConfig: resolvedViteConfig(root),
			entryFileName: "index.js",
			includeAssets: false,
		});

		expect(outputConfig.d1_databases).toEqual([
			{
				binding: "DATABASE",
				database_name: "db",
				database_id: "db-id",
				migrations_dir: "../../migrations",
				migrations_pattern: undefined,
			},
		]);
	});

	test("preserves Wrangler's default migrations directory even when it is not on disk", ({
		expect,
	}) => {
		const root = createRoot();

		const outputConfig = getOutputConfig({
			inputWorkerConfig: workerConfig(root, {
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "db-id",
					},
				],
			}),
			workerOutputDirectory: "dist/api_worker",
			resolvedViteConfig: resolvedViteConfig(root),
			entryFileName: "index.js",
			includeAssets: false,
		});

		expect(outputConfig.d1_databases).toEqual([
			{
				binding: "DATABASE",
				database_name: "db",
				database_id: "db-id",
				migrations_dir: "../../workers/api/migrations",
				migrations_pattern: undefined,
			},
		]);
	});

	test("inherits assets.base_path from the resolved Vite base", ({
		expect,
	}) => {
		const root = createRoot();

		const outputConfig = getOutputConfig({
			inputWorkerConfig: workerConfig(root, {
				assets: { directory: "public" },
			}),
			workerOutputDirectory: "dist/api_worker",
			resolvedViteConfig: resolvedViteConfig(root, "/app/"),
			entryFileName: "index.js",
			includeAssets: true,
		});

		expect(outputConfig.assets?.base_path).toBe("/app/");
	});

	test("decodes the final resolved Vite base", ({ expect }) => {
		const root = createRoot();

		const outputConfig = getOutputConfig({
			inputWorkerConfig: workerConfig(root, {
				assets: { directory: "public" },
			}),
			workerOutputDirectory: "dist/api_worker",
			resolvedViteConfig: resolvedViteConfig(root, "/caf%C3%A9/"),
			entryFileName: "index.js",
			includeAssets: true,
		});

		expect(outputConfig.assets?.base_path).toBe("/café/");
	});

	test("omits an absolute-URL Vite base", ({ expect }) => {
		const root = createRoot();
		const outputConfig = getOutputConfig({
			inputWorkerConfig: workerConfig(root, {
				assets: { directory: "public" },
			}),
			workerOutputDirectory: "dist/api_worker",
			resolvedViteConfig: resolvedViteConfig(root, "https://example.com/app/"),
			entryFileName: "index.js",
			includeAssets: true,
		});

		expect(outputConfig.assets?.base_path).toBeUndefined();
	});

	test("prefers an explicit assets.base_path over the Vite base", ({
		expect,
	}) => {
		const root = createRoot();

		const outputConfig = getOutputConfig({
			inputWorkerConfig: workerConfig(root, {
				assets: { directory: "public", base_path: "/assets" },
			}),
			workerOutputDirectory: "dist/api_worker",
			resolvedViteConfig: resolvedViteConfig(root, "/vite/"),
			entryFileName: "index.js",
			includeAssets: true,
		});

		expect(outputConfig.assets?.base_path).toBe("/assets");
	});
});
