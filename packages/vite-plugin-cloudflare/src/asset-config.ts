import * as path from "node:path";
import { normalizeUriEncodedBasePath } from "@cloudflare/workers-shared/utils/base-path";
import {
	constructHeaders,
	constructRedirects,
} from "@cloudflare/workers-shared/utils/configuration/constructConfiguration";
import { parseHeaders } from "@cloudflare/workers-shared/utils/configuration/parseHeaders";
import { parseRedirects } from "@cloudflare/workers-shared/utils/configuration/parseRedirects";
import {
	HEADERS_FILENAME,
	REDIRECTS_FILENAME,
} from "@cloudflare/workers-shared/utils/constants";
import { maybeGetFile } from "@cloudflare/workers-shared/utils/helpers";
import {
	HeadersSchema,
	RedirectsSchema,
} from "@cloudflare/workers-shared/utils/types";
import type {
	AssetsOnlyResolvedConfig,
	WorkersResolvedConfig,
} from "./plugin-config";
import type { ParsedInputWorkerConfig } from "@cloudflare/config";
import type { Logger } from "@cloudflare/workers-shared/utils/configuration/types";
import type { AssetConfig } from "@cloudflare/workers-shared/utils/types";
import type * as vite from "vite";
import type { Unstable_Config } from "wrangler";

interface ResolvedViteBase {
	base: string;
}

/**
 * Returns true if the `changedFile` matches one of the _headers or _redirects files,
 * and the experimental support for these files is turned on.
 */
export function hasAssetsConfigChanged(
	resolvedPluginConfig: AssetsOnlyResolvedConfig | WorkersResolvedConfig,
	resolvedViteConfig: vite.ResolvedConfig,
	changedFilePath: string
) {
	if (!resolvedPluginConfig.experimental?.headersAndRedirectsDevModeSupport) {
		return false;
	}
	return [
		getRedirectsConfigPath(resolvedViteConfig),
		getHeadersConfigPath(resolvedViteConfig),
	].includes(changedFilePath);
}

/**
 * Computes the assets config that will be passed to Miniflare,
 * taking into account whether experimental _headers and _redirects support is on.
 */
export function getAssetsConfig(
	resolvedPluginConfig: AssetsOnlyResolvedConfig | WorkersResolvedConfig,
	entryWorkerConfig: Unstable_Config | undefined,
	resolvedConfig: vite.ResolvedConfig
): AssetConfig {
	const assetsConfig =
		resolvedPluginConfig.type === "assets-only"
			? resolvedPluginConfig.config.assets
			: entryWorkerConfig?.assets;
	const basePath = resolveAssetsBasePath(
		assetsConfig?.base_path,
		resolvedConfig
	);

	const compatibilityOptions =
		resolvedPluginConfig.type === "assets-only"
			? {
					compatibility_date: resolvedPluginConfig.config.compatibility_date,
					compatibility_flags: resolvedPluginConfig.config.compatibility_flags,
				}
			: {
					...(entryWorkerConfig?.compatibility_date
						? { compatibility_date: entryWorkerConfig.compatibility_date }
						: {}),
					...(entryWorkerConfig?.compatibility_flags
						? { compatibility_flags: entryWorkerConfig.compatibility_flags }
						: {}),
				};

	const config = {
		...compatibilityOptions,
		...assetsConfig,
		base_path: basePath,
		has_static_routing:
			resolvedPluginConfig.type === "workers" &&
			resolvedPluginConfig.staticRouting
				? true
				: false,
	} satisfies AssetConfig;

	if (!resolvedPluginConfig.experimental?.headersAndRedirectsDevModeSupport) {
		return config;
	}

	const logger: Logger = {
		debug() {
			/* No debug log in Vite. */
		},
		log(message: string) {
			resolvedConfig.logger.info(message);
		},
		info(message: string) {
			resolvedConfig.logger.info(message);
		},
		warn(message: string) {
			resolvedConfig.logger.warn(message);
		},
		error(error: Error) {
			resolvedConfig.logger.error(error.message, { error });
		},
	};

	const redirectsFile = getRedirectsConfigPath(resolvedConfig);
	const redirectsContents = maybeGetFile(redirectsFile);
	const redirects =
		redirectsContents &&
		RedirectsSchema.parse(
			constructRedirects({
				redirects: parseRedirects(redirectsContents, {
					htmlHandling: assetsConfig?.html_handling,
				}),
				redirectsFile,
				logger,
			}).redirects
		);

	const headersFile = getHeadersConfigPath(resolvedConfig);
	const headersContents = maybeGetFile(headersFile);
	const headers =
		headersContents &&
		HeadersSchema.parse(
			constructHeaders({
				headers: parseHeaders(headersContents),
				headersFile,
				logger,
			}).headers
		);

	return {
		...config,
		...(redirects ? { redirects } : {}),
		...(headers ? { headers } : {}),
	};
}

export function resolveAssetsBasePath(
	basePath: string | undefined,
	resolvedConfig: ResolvedViteBase
): string | undefined {
	if (basePath !== undefined) {
		return basePath;
	}

	if (
		!resolvedConfig.base.startsWith("/") ||
		resolvedConfig.base.startsWith("//")
	) {
		return undefined;
	}

	const normalizedBasePath = normalizeUriEncodedBasePath(resolvedConfig.base);
	return normalizedBasePath.valid
		? normalizedBasePath.value
		: resolvedConfig.base;
}

export function inheritAssetsBasePath(
	config: ParsedInputWorkerConfig,
	resolvedConfig: ResolvedViteBase
): ParsedInputWorkerConfig {
	if (config.assets === undefined) {
		return config;
	}
	const basePath = resolveAssetsBasePath(
		config.assets.basePath,
		resolvedConfig
	);
	if (basePath === undefined || basePath === config.assets.basePath) {
		return config;
	}
	return {
		...config,
		assets: {
			...config.assets,
			basePath,
		},
	};
}

function getRedirectsConfigPath(config: vite.ResolvedConfig): string {
	return path.join(config.publicDir, REDIRECTS_FILENAME);
}

function getHeadersConfigPath(config: vite.ResolvedConfig): string {
	return path.join(config.publicDir, HEADERS_FILENAME);
}
