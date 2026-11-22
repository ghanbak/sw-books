// Focus helpers for admin forms (#370). Pure so the root Vitest suite can cover them
// without a DOM.

/**
 * The first field in `order` (the form's visual order) that has an error, or `null`.
 * Walks `order`, not the errors object: its key order follows the schema/patch, which
 * can disagree with the layout. Cleared (`undefined`) and empty messages don't count.
 */
export function firstInvalidField<F extends string>(
	errors: Partial<Record<string, string | undefined>>,
	order: readonly F[],
): F | null {
	return order.find((field) => errors[field]) ?? null;
}
