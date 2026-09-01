import { useCallback, useEffect, useReducer, useRef } from "react";
import { emailSendRouting } from "../../../api";
import {
	nextAttachmentReadGeneration,
	readAttachmentFiles,
} from "./attachment-utils";
import {
	createInitialComposerState,
	testEmailComposerReducer,
} from "./composer-reducer";
import {
	isMissingEmailHandlerError,
	normalizeTestEmailDraft,
	validateTestEmailComposer,
} from "./composer-utils";
import type {
	TestEmailComposerField,
	TestEmailComposerState,
	TestEmailDraft,
} from "./types";

interface UseSendTestEmailComposerOptions {
	initialDraft?: TestEmailDraft;
	onError: (message: string) => void;
	onOpenChange: (open: boolean) => void;
	onSent: (draft: TestEmailDraft) => void;
	open: boolean;
	worker?: string;
}

export interface SendTestEmailComposerController {
	attachments: {
		addFiles: (files: File[]) => Promise<void>;
		remove: (index: number) => void;
	};
	fields: {
		change: (field: TestEmailComposerField, value: string) => void;
	};
	headers: {
		add: () => void;
		change: (id: number, field: "name" | "value", value: string) => void;
		remove: (id: number) => void;
	};
	openState: {
		change: (open: boolean) => void;
	};
	state: TestEmailComposerState;
	submission: {
		submit: () => Promise<void>;
	};
}

/** Coordinates test-email state, attachment reads, and API submission. */
export function useSendTestEmailComposer({
	initialDraft,
	onError,
	onOpenChange,
	onSent,
	open,
	worker,
}: UseSendTestEmailComposerOptions): SendTestEmailComposerController {
	const [state, dispatch] = useReducer(
		testEmailComposerReducer,
		undefined,
		createInitialComposerState
	);
	const attachmentReadGenerationRef = useRef<number>(0);
	const nextHeaderIdRef = useRef<number>(0);

	const loadDraft = useCallback((draft?: TestEmailDraft) => {
		const normalizedDraft = normalizeTestEmailDraft(draft);
		const readGeneration = nextAttachmentReadGeneration(
			attachmentReadGenerationRef.current
		);
		attachmentReadGenerationRef.current = readGeneration;
		dispatch({
			type: "loadDraft",
			attachments: normalizedDraft.attachments,
			bcc: normalizedDraft.bcc,
			cc: normalizedDraft.cc,
			from: normalizedDraft.from,
			headers: normalizedDraft.headers.map((header) => ({
				...header,
				id: nextHeaderIdRef.current++,
			})),
			html: normalizedDraft.html,
			readGeneration,
			replyTo: normalizedDraft.replyTo,
			subject: normalizedDraft.subject,
			text: normalizedDraft.text,
			to: normalizedDraft.to,
		});
	}, []);

	useEffect(() => {
		if (open) {
			loadDraft(initialDraft);
		}
	}, [initialDraft, loadDraft, open]);

	function changeField(field: TestEmailComposerField, value: string): void {
		dispatch({ type: "changeField", field, value });
	}

	function addHeader(): void {
		dispatch({
			type: "addHeader",
			header: { id: nextHeaderIdRef.current++, name: "", value: "" },
		});
	}

	function changeHeader(
		id: number,
		field: "name" | "value",
		value: string
	): void {
		dispatch({ type: "changeHeader", field, id, value });
	}

	async function addFiles(files: File[]): Promise<void> {
		if (files.length === 0) {
			return;
		}
		const readGeneration = attachmentReadGenerationRef.current;
		dispatch({ type: "startAttachmentRead" });
		try {
			const attachments = await readAttachmentFiles(files);
			if (readGeneration !== attachmentReadGenerationRef.current) {
				return;
			}
			dispatch({
				type: "finishAttachmentRead",
				attachments,
				readGeneration,
			});
		} catch (error) {
			if (readGeneration !== attachmentReadGenerationRef.current) {
				return;
			}
			dispatch({
				type: "failAttachmentRead",
				error:
					error instanceof Error
						? error.message
						: "Failed to read the selected file.",
				readGeneration,
			});
		}
	}

	function handleOpenChange(newOpen: boolean): void {
		if (!newOpen && state.sending) {
			return;
		}
		if (!newOpen) {
			loadDraft();
		}
		onOpenChange(newOpen);
	}

	async function submit(): Promise<void> {
		const validation = validateTestEmailComposer(state);
		dispatch({
			type: "applyValidation",
			attachmentsError: validation.attachmentsError,
			fromError: validation.fromError,
			headers: validation.headers,
			toError: validation.toError,
		});
		if (!validation.request || !validation.sentDraft) {
			return;
		}
		if (!worker) {
			onError("Select a worker before sending a test email.");
			return;
		}

		dispatch({ type: "startSending" });
		try {
			const { error: sendError, response } = await emailSendRouting({
				body: validation.request,
				query: { worker },
				throwOnError: false,
			});
			if (sendError || !response.ok) {
				onError(
					sendError?.errors?.[0]?.message ?? "Failed to send test email."
				);
				if (!isMissingEmailHandlerError(sendError, worker)) {
					return;
				}
			}
			loadDraft();
			onSent(validation.sentDraft);
			onOpenChange(false);
		} catch (error) {
			onError(
				error instanceof Error ? error.message : "Failed to send test email."
			);
		} finally {
			dispatch({ type: "finishSending" });
		}
	}

	return {
		attachments: {
			addFiles,
			remove: (index) => dispatch({ type: "removeAttachment", index }),
		},
		fields: { change: changeField },
		headers: {
			add: addHeader,
			change: changeHeader,
			remove: (id) => dispatch({ type: "removeHeader", id }),
		},
		openState: { change: handleOpenChange },
		state,
		submission: { submit },
	};
}
