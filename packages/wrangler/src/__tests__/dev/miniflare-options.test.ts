import { Log, LogLevel } from "miniflare";
import { describe, it } from "vitest";
import { buildMiniflareOptions } from "../../dev/miniflare";
import type { ConfigBundle } from "../../dev/miniflare";
import type { EsbuildBundle } from "../../dev/use-esbuild";
import type { UUID } from "node:crypto";

const bundle: EsbuildBundle = {
	type: "esm",
	modules: [],
	id: 0,
	path: "/virtual/index.mjs",
	entrypointSource: "export default {};",
	entry: {
		file: "index.mjs",
		projectRoot: "/virtual",
		configPath: undefined,
		format: "modules",
		moduleRoot: "/virtual",
		name: "worker",
		exports: [],
	},
	dependencies: {},
	sourceMapPath: undefined,
	sourceMapMetadata: undefined,
};

function createConfig(
	crons: string[] | undefined
): Omit<ConfigBundle, "rules"> {
	return {
		name: "worker",
		projectRoot: "/virtual",
		bundle,
		format: "modules",
		compatibilityDate: "2026-01-01",
		compatibilityFlags: undefined,
		complianceRegion: undefined,
		bindings: {},
		migrations: undefined,
		exports: undefined,
		devRegistry: undefined,
		legacyAssetPaths: undefined,
		assets: undefined,
		initialPort: 0,
		initialIp: "127.0.0.1",
		inspectorPort: 0,
		inspectorHost: "127.0.0.1",
		localPersistencePath: false,
		crons,
		routes: undefined,
		queueConsumers: undefined,
		connectHandlers: [],
		localProtocol: "http",
		localUpstream: undefined,
		upstreamProtocol: "http",
		inspect: false,
		outboundService: undefined,
		tails: undefined,
		streamingTails: undefined,
		testScheduled: false,
		containerDOClassNames: undefined,
		containerBuildId: undefined,
		containerEngine: undefined,
		enableContainers: false,
		zone: undefined,
		access: undefined,
		sendMetrics: false,
		publicUrl: undefined,
		structuredLogsHandler: undefined,
	};
}

describe("buildMiniflareOptions", () => {
	it.for([
		{ label: "missing", crons: undefined },
		{ label: "empty", crons: [] as string[] },
		{
			label: "multiple exact",
			crons: ["*/5 * * * *", " 0 17 * * SUN "],
		},
	])(
		"passes $label crons to the user Worker",
		async ({ crons }, { expect }) => {
			const options = await buildMiniflareOptions(
				new Log(LogLevel.NONE),
				createConfig(crons),
				"00000000-0000-4000-8000-000000000000" as UUID,
				undefined
			);

			expect(options.workers[0].cronTriggers).toEqual(crons);
		}
	);
});
