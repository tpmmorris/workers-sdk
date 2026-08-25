import assetPath from "./asset.txt?no-inline";

interface Env {
	ASSETS: Fetcher;
}

export default {
	async fetch(request, env) {
		const { pathname } = new URL(request.url);
		// eslint-disable-next-line turbo/no-undeclared-env-vars -- Build-time replaced by Vite, not a process environment variable
		const apiPath = `${import.meta.env.BASE_URL}api/`;

		if (pathname.startsWith(apiPath)) {
			if (pathname === `${apiPath}asset`) {
				const response = await env.ASSETS.fetch(
					new URL(assetPath, request.url)
				);
				const text = await response.text();

				return new Response(`Modified: ${text}`);
			}

			return Response.json({
				name: "Cloudflare",
			});
		}

		const response = await env.ASSETS.fetch(request);
		const modifiedResponse = new Response(response.body, response);
		modifiedResponse.headers.append("is-worker-response", "true");

		return modifiedResponse;
	},
} satisfies ExportedHandler<Env>;
