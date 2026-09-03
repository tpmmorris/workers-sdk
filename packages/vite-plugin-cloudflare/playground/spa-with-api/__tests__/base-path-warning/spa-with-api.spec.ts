import { test } from "vitest";
import { isBuild, serverLogs } from "../../../__test-utils__";

const warning =
	'The resolved Vite base "./" is not a root-relative path, so it cannot be used as assets.base_path. Set assets.base_path explicitly if the application should be served from a subpath.';

function getMatchingWarnings(): string[] {
	return serverLogs.warns.filter((message) => message === warning);
}

test.runIf(isBuild)(
	"warns once when a relative Vite base cannot be inherited",
	({ expect }) => {
		expect(getMatchingWarnings()).toHaveLength(1);
	}
);

test.runIf(!isBuild)(
	"does not warn when dev resolves a relative base to root",
	({ expect }) => {
		expect(getMatchingWarnings()).toHaveLength(0);
	}
);
