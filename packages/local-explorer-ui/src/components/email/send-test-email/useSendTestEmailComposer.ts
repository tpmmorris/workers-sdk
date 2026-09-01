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
	getEmailSendErrorMessage,
	isMissingEmailHandlerError,
	normalizeTestEmailDraft,
	validateTestEmailComposer,
} from "./composer-utils";
import { getRawEmailSelectionError } from "./raw-email-validation";
import { sendRawTestEmail } from "./send-raw-test-email";
import type {
	TestEmailComposerField,
	TestEmailComposerState,
	TestEmailDraft,
} from "./types";

interface UseSendTestEmailComposerOptions {
	incompleteSource?: boolean;
	initialDraft?: TestEmailDraft;
	onError: (message: string) => void;
	onOpenChange: (open: boolean) => void;
	onSendSuccess: () => void;
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
	rawFile: {
		remove: () => void;
		select: (files: File[]) => void;
	};
	state: TestEmailComposerState;
	submission: {
		submit: () => Promise<void>;
	};
}

function getRawHandlerError(result: {
	outcome?: "ok" | "exception";
	rejectReason?: string;
}): string | null {
	if (result.rejectReason !== undefined) {
		return result.rejectReason
			? `The Worker's email() handler rejected the message: ${result.rejectReason}`
			: "The Worker's email() handler rejected the message.";
	}
	if (result.outcome === "exception") {
		return "The Worker's email() handler threw an exception.";
	}
	return null;
}

/** Coordinates test-email state, attachment reads, and API submission. */
export function useSendTestEmailComposer({
	incompleteSource = false,
	initialDraft,
	onError,
	onOpenChange,
	onSendSuccess,
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
	const sendingRef = useRef<boolean>(false);

	const loadDraft = useCallback((draft?: TestEmailDraft) => {
		const normalizedDraft = normalizeTestEmailDraft(draft);
		const readGeneration = nextAttachmentReadGeneration(
			attachmentReadGenerationRef.current
		);
		attachmentReadGenerationRef.current = readGeneration;
		dispatch({
			type: "loadDraft",
			attachments: normalizedDraft.attachments,
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

	function selectRawFiles(files: File[]): void {
		if (files.length === 0) {
			return;
		}
		const error = getRawEmailSelectionError(files);
		if (error) {
			dispatch({ type: "rejectRawFiles", error });
			return;
		}
		const file = files[0];
		if (file) {
			dispatch({ type: "selectRawFile", file });
		}
	}

	async function submitRawFile(
		file: File,
		selectedWorker: string
	): Promise<void> {
		const selectionError = getRawEmailSelectionError([file]);
		if (selectionError) {
			dispatch({ type: "rejectRawFiles", error: selectionError });
			return;
		}

		sendingRef.current = true;
		dispatch({ type: "startSending" });
		try {
			const { data, error, response } = await sendRawTestEmail(
				file,
				selectedWorker
			);
			if (error || !response?.ok) {
				onError(getEmailSendErrorMessage(error));
				if (!isMissingEmailHandlerError(error, selectedWorker)) {
					return;
				}
			}
			const handlerError = getRawHandlerError(data?.result ?? {});
			if (handlerError) {
				onError(handlerError);
			}
			loadDraft();
			onSendSuccess();
			onOpenChange(false);
		} catch (error) {
			onError(getEmailSendErrorMessage(error));
		} finally {
			sendingRef.current = false;
			dispatch({ type: "finishSending" });
		}
	}

	async function submit(): Promise<void> {
		if (sendingRef.current) {
			return;
		}
		if (state.rawFile) {
			if (!worker) {
				onError("Select a worker before sending a test email.");
				return;
			}
			await submitRawFile(state.rawFile, worker);
			return;
		}

		const validation = validateTestEmailComposer(state);
		dispatch({
			type: "applyValidation",
			attachmentsError: validation.attachmentsError,
			fromError: validation.fromError,
			headers: validation.headers,
			toError: validation.toError,
		});
		if (!validation.request) {
			return;
		}
		if (!worker) {
			onError("Select a worker before sending a test email.");
			return;
		}

		sendingRef.current = true;
		dispatch({ type: "startSending" });
		try {
			const { error: sendError, response } = await emailSendRouting({
				body: validation.request,
				query: {
					...(incompleteSource ? { incomplete_source: true } : {}),
					worker,
				},
				throwOnError: false,
			});
			if (sendError || !response.ok) {
				onError(getEmailSendErrorMessage(sendError));
				if (!isMissingEmailHandlerError(sendError, worker)) {
					return;
				}
			}
			loadDraft();
			onSendSuccess();
			onOpenChange(false);
		} catch (error) {
			onError(getEmailSendErrorMessage(error));
		} finally {
			sendingRef.current = false;
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
		rawFile: {
			remove: () => dispatch({ type: "removeRawFile" }),
			select: selectRawFiles,
		},
		state,
		submission: { submit },
	};
}
