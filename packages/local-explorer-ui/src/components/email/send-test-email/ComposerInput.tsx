import { Input } from "@cloudflare/kumo";
import type { ComponentPropsWithoutRef, JSX, ReactNode } from "react";

type ComposerInputProps = ComponentPropsWithoutRef<"input"> & {
	error?: string;
	label?: ReactNode;
	labelTooltip?: ReactNode;
};

// Kumo and the monorepo currently resolve different React type versions. Keep
// native input props checked against this package's React types at the boundary.
export const ComposerInput = Input as unknown as (
	props: ComposerInputProps
) => JSX.Element;

export function RequiredLabel({
	children,
}: {
	children: ReactNode;
}): JSX.Element {
	return (
		<>
			{children} <span aria-hidden="true">*</span>
		</>
	);
}
