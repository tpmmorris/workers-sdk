import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	base: "/docs/",
	publicDir: "public-base-path",
	plugins: [
		react(),
		cloudflare({
			configPath: "./wrangler.base-path.jsonc",
			inspectorPort: false,
			persistState: false,
			experimental: { headersAndRedirectsDevModeSupport: true },
		}),
	],
});
