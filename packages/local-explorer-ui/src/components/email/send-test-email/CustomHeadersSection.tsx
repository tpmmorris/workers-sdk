import { Button, InputArea } from "@cloudflare/kumo";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { ComposerInput } from "./ComposerInput";
import type { TestEmailHeaderField } from "./types";
import type { JSX } from "react";

interface CustomHeadersSectionProps {
	headers: TestEmailHeaderField[];
	onAdd: () => void;
	onChange: (id: number, field: "name" | "value", value: string) => void;
	onRemove: (id: number) => void;
}

function HeaderFieldLabel({
	index,
	label,
}: {
	index: number;
	label: "Name" | "Value";
}): JSX.Element {
	return (
		<>
			<span className="sr-only">
				Header {index + 1} {label.toLowerCase()}
			</span>
			<span aria-hidden="true">{label}</span>
		</>
	);
}

/** Renders custom email-header editing and validation errors. */
export function CustomHeadersSection({
	headers,
	onAdd,
	onChange,
	onRemove,
}: CustomHeadersSectionProps): JSX.Element {
	return (
		<div>
			<div className="mb-2 flex items-center justify-between">
				<p className="text-sm font-medium text-kumo-default">Custom headers</p>
				<Button type="button" variant="ghost" onClick={onAdd}>
					<PlusIcon size={14} />
					Add header
				</Button>
			</div>

			{headers.length === 0 ? (
				<p className="text-sm text-kumo-subtle italic">No custom headers</p>
			) : (
				<div className="space-y-3">
					{headers.map((header, index) => (
						<div
							className="min-w-0 rounded-lg bg-kumo-elevated px-3 py-3 ring ring-kumo-line"
							key={header.id}
						>
							<div className="flex min-w-0 items-start gap-2">
								<div className="grid min-w-0 flex-1 grid-cols-1 items-start gap-3 sm:grid-cols-2">
									<div className="min-w-0 [&_[role=alert]]:break-words [&>*]:min-w-0">
										<ComposerInput
											aria-invalid={header.nameError ? true : undefined}
											className={
												header.nameError
													? "w-full ring-2 !ring-kumo-danger"
													: "w-full"
											}
											error={header.nameError}
											id={`test-email-header-${header.id}-name`}
											label={<HeaderFieldLabel index={index} label="Name" />}
											onChange={(event) =>
												onChange(header.id, "name", event.target.value)
											}
											placeholder="X-Custom-Header"
											type="text"
											value={header.name}
										/>
									</div>
									<div className="min-w-0 [&_[role=alert]]:break-words [&>*]:min-w-0">
										<InputArea
											aria-invalid={header.valueError ? true : undefined}
											className={`h-9 w-full resize-none py-1.5 ${
												header.valueError ? "ring-2 !ring-kumo-danger" : ""
											}`}
											error={header.valueError}
											id={`test-email-header-${header.id}-value`}
											label={<HeaderFieldLabel index={index} label="Value" />}
											onChange={(event) =>
												onChange(header.id, "value", event.target.value)
											}
											placeholder="Header value"
											rows={1}
											value={header.value}
										/>
									</div>
								</div>
								<Button
									aria-label={`Remove header ${index + 1}`}
									className="mt-7 shrink-0"
									onClick={() => onRemove(header.id)}
									shape="square"
									type="button"
									variant="ghost"
								>
									<TrashIcon size={14} />
								</Button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
