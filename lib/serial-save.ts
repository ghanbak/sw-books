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

/**
 * Per-row save chain for inline edits that stay mounted after a save (no
 * remount frees a gate). A save queued while another for the same row is in
 * flight waits for it and sends the `updated_at` that save returned, instead
 * of the stale one it was queued with. The entry is dropped once the chain
 * drains, so the next edit uses the caller's (refreshed) `updated_at`.
 */
export type RowSaveQueue = Map<string, { tail: Promise<unknown>; at: string | null }>;

export function createRowSaveQueue(): RowSaveQueue {
	return new Map();
}

/**
 * `savedAt` returns the row's new `updated_at` for a successful result, or
 * `undefined` for a failed one (later saves keep the previous value).
 */
export function queueRowSave<T>(
	queue: RowSaveQueue,
	id: string,
	loadedAt: string | null,
	send: (at: string | null) => Promise<T>,
	savedAt: (result: T) => string | null | undefined,
): Promise<T> {
	const slot = queue.get(id) ?? { tail: Promise.resolve(), at: loadedAt };
	const run = slot.tail.then(async () => {
		const result = await send(slot.at);
		const next = savedAt(result);
		if (next !== undefined) slot.at = next;
		return result;
	});
	const tail = run.then(
		() => undefined,
		() => undefined,
	);
	slot.tail = tail;
	queue.set(id, slot);
	void tail.then(() => {
		if (slot.tail === tail && queue.get(id) === slot) queue.delete(id);
	});
	return run;
}
