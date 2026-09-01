import { createContext, useContext, useMemo, useState } from "react";
import type { TestEmailDraft } from "./send-test-email";
import type { Dispatch, JSX, PropsWithChildren, SetStateAction } from "react";

type TestEmailDrafts = Record<string, TestEmailDraft>;

interface TestEmailDraftsContextValue {
	drafts: TestEmailDrafts;
	setDrafts: Dispatch<SetStateAction<TestEmailDrafts>>;
}

const TestEmailDraftsContext =
	createContext<TestEmailDraftsContextValue | null>(null);

/** Retains successful test-email drafts while navigating between email routes. */
export function TestEmailDraftsProvider({
	children,
}: PropsWithChildren): JSX.Element {
	const [drafts, setDrafts] = useState<TestEmailDrafts>({});
	const value = useMemo(() => ({ drafts, setDrafts }), [drafts]);

	return (
		<TestEmailDraftsContext.Provider value={value}>
			{children}
		</TestEmailDraftsContext.Provider>
	);
}

/** Returns the successful test-email drafts retained by the email layout. */
export function useTestEmailDrafts(): TestEmailDraftsContextValue {
	const context = useContext(TestEmailDraftsContext);
	if (!context) {
		throw new Error(
			"useTestEmailDrafts must be used within a TestEmailDraftsProvider"
		);
	}

	return context;
}
