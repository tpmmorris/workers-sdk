import { describe, test } from "vitest";
import {
	drainEmailArtifactManager,
	EmailArtifactManager,
	getEmailArtifactManager,
} from "../../../src/plugins/email/artifacts";

const ARTIFACT = {
	recordId: "message-id@example.com",
	prefix: "email",
	id: "message-id@example.com",
	extension: "eml",
};

function deferred<T>() {
	let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined;
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve;
	});
	return {
		promise,
		resolve(value: T) {
			if (resolvePromise === undefined) {
				throw new Error("Deferred promise was already resolved");
			}
			resolvePromise(value);
		},
	};
}

describe("EmailArtifactManager", () => {
	test("serializes writes for the same artifact", async ({ expect }) => {
		const manager = new EmailArtifactManager();
		const firstWrite = deferred<void>();
		const writes: string[] = [];

		const first = manager.store(ARTIFACT, async () => {
			writes.push("first");
			await firstWrite.promise;
			return "/first.eml";
		});
		const second = manager.store(ARTIFACT, async () => {
			writes.push("second");
			return "/second.eml";
		});

		await Promise.resolve();
		expect(writes).toEqual(["first"]);
		firstWrite.resolve(undefined);

		expect(await first).toBe("/first.eml");
		expect(await second).toBe("/second.eml");
		expect(writes).toEqual(["first", "second"]);
	});

	test("tombstones a queued write when its record is deleted", async ({
		expect,
	}) => {
		const manager = new EmailArtifactManager();
		const firstWrite = deferred<void>();
		let removed: (typeof ARTIFACT)[] = [];

		const first = manager.store(ARTIFACT, async () => {
			await firstWrite.promise;
			return "/first.eml";
		});
		await Promise.resolve();
		const second = manager.store(ARTIFACT, async () => "/second.eml");
		const deletion = manager.delete([ARTIFACT], async (artifacts) => {
			removed = artifacts;
		});

		firstWrite.resolve(undefined);

		expect(await first).toBe("/first.eml");
		expect(await second).toBeNull();
		await deletion;
		expect(removed).toEqual([ARTIFACT]);
	});

	test("normalizes artifacts before removing them", async ({ expect }) => {
		const manager = new EmailArtifactManager();
		let removed: Array<typeof ARTIFACT> = [];

		await manager.delete(
			[
				{
					recordId: "../record",
					prefix: "../email",
					id: "../message",
					extension: "../eml",
				},
			],
			async (artifacts) => {
				removed = artifacts;
			}
		);

		expect(removed).toHaveLength(1);
		expect(removed[0]).toBeDefined();
		expect(JSON.stringify(removed[0])).not.toContain("..");
	});

	test("drain waits for pending operations and releases the manager", async ({
		expect,
	}) => {
		const controller = new AbortController();
		const manager = getEmailArtifactManager(controller.signal);
		const write = deferred<void>();
		let completed = false;

		void manager.store(ARTIFACT, async () => {
			await write.promise;
			completed = true;
			return "/message.eml";
		});

		const draining = drainEmailArtifactManager(controller.signal);
		await Promise.resolve();
		expect(completed).toBe(false);

		write.resolve(undefined);
		await draining;
		expect(completed).toBe(true);
		expect(getEmailArtifactManager(controller.signal)).not.toBe(manager);
	});
});
