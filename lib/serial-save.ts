/**
 * One-save-at-a-time gate for a form bound to a row's loaded `updated_at`.
 *
 * A successful save bumps the row's `updated_at`, so the form's copy is stale
 * until `router.refresh()` lands and the form (keyed on `updated_at`) remounts.
 * The gate therefore stays held after a success and is only freed by that
 * remount (a fresh gate). A failed or thrown save releases it so the user can
 * retry. Without this, a second click in the gap sends the stale `updated_at`
 * and gets a spurious CONFLICT.
 */
export type SaveGate = { held: boolean };

export function createSaveGate(): SaveGate {
	return { held: false };
}

/**
 * Run `send` unless a save already holds the gate. Returns `undefined` when
 * skipped. The gate is taken synchronously, before the first await.
 */
export async function serializeSave<T>(
	gate: SaveGate,
	send: () => Promise<T>,
	isOk: (result: T) => boolean,
): Promise<T | undefined> {
	if (gate.held) return undefined;
	gate.held = true;
	try {
		const result = await send();
		if (!isOk(result)) gate.held = false;
		return result;
	} catch (e) {
		gate.held = false;
		throw e;
	}
}
