import type {
	SelectedTestEmailAttachment,
	TestEmailComposerField,
	TestEmailComposerState,
	TestEmailHeaderField,
} from "./types";

export type TestEmailComposerAction =
	| {
			type: "loadDraft";
			attachments: SelectedTestEmailAttachment[];
			bcc: string;
			cc: string;
			from: string;
			headers: TestEmailHeaderField[];
			html: string;
			readGeneration: number;
			replyTo: string;
			subject: string;
			text: string;
			to: string;
	  }
	| { type: "changeField"; field: TestEmailComposerField; value: string }
	| { type: "addHeader"; header: TestEmailHeaderField }
	| { type: "removeHeader"; id: number }
	| {
			type: "changeHeader";
			field: "name" | "value";
			id: number;
			value: string;
	  }
	| { type: "startAttachmentRead" }
	| {
			type: "finishAttachmentRead";
			attachments: SelectedTestEmailAttachment[];
			readGeneration: number;
	  }
	| {
			type: "failAttachmentRead";
			error: string;
			readGeneration: number;
	  }
	| { type: "removeAttachment"; index: number }
	| {
			type: "applyValidation";
			attachmentsError: string | null;
			fromError: string | null;
			headers: TestEmailHeaderField[];
			toError: string | null;
	  }
	| { type: "startSending" }
	| { type: "finishSending" };

/** Creates the blank state used before a draft is loaded. */
export function createInitialComposerState(): TestEmailComposerState {
	return {
		attachments: [],
		attachmentsError: null,
		attachmentReadGeneration: 0,
		bcc: "",
		cc: "",
		from: "",
		fromError: null,
		headers: [],
		html: "",
		pendingAttachmentReads: 0,
		replyTo: "",
		sending: false,
		subject: "",
		text: "",
		to: "",
		toError: null,
	};
}

/** Applies atomic composer state transitions. */
export function testEmailComposerReducer(
	state: TestEmailComposerState,
	action: TestEmailComposerAction
): TestEmailComposerState {
	switch (action.type) {
		case "loadDraft":
			return {
				attachments: action.attachments,
				attachmentsError: null,
				attachmentReadGeneration: action.readGeneration,
				bcc: action.bcc,
				cc: action.cc,
				from: action.from,
				fromError: null,
				headers: action.headers,
				html: action.html,
				pendingAttachmentReads: 0,
				replyTo: action.replyTo,
				sending: state.sending,
				subject: action.subject,
				text: action.text,
				to: action.to,
				toError: null,
			};
		case "changeField":
			return {
				...state,
				[action.field]: action.value,
				...(action.field === "from" ? { fromError: null } : {}),
				...(action.field === "to" ? { toError: null } : {}),
			};
		case "addHeader":
			return { ...state, headers: [...state.headers, action.header] };
		case "removeHeader":
			return {
				...state,
				headers: state.headers.filter((header) => header.id !== action.id),
			};
		case "changeHeader":
			return {
				...state,
				headers: state.headers.map((header) =>
					header.id === action.id
						? {
								...header,
								[action.field]: action.value,
								...(action.field === "name"
									? { nameError: undefined }
									: { valueError: undefined }),
							}
						: header
				),
			};
		case "startAttachmentRead":
			return {
				...state,
				attachmentsError: null,
				pendingAttachmentReads: state.pendingAttachmentReads + 1,
			};
		case "finishAttachmentRead":
			if (action.readGeneration !== state.attachmentReadGeneration) {
				return state;
			}
			return {
				...state,
				attachments: [...state.attachments, ...action.attachments],
				pendingAttachmentReads: state.pendingAttachmentReads - 1,
			};
		case "failAttachmentRead":
			if (action.readGeneration !== state.attachmentReadGeneration) {
				return state;
			}
			return {
				...state,
				attachmentsError: action.error,
				pendingAttachmentReads: state.pendingAttachmentReads - 1,
			};
		case "removeAttachment":
			return {
				...state,
				attachments: state.attachments.filter(
					(_, index) => index !== action.index
				),
				attachmentsError: null,
			};
		case "applyValidation":
			return {
				...state,
				attachmentsError: action.attachmentsError,
				fromError: action.fromError,
				headers: action.headers,
				toError: action.toError,
			};
		case "startSending":
			return { ...state, sending: true };
		case "finishSending":
			return { ...state, sending: false };
	}
}
