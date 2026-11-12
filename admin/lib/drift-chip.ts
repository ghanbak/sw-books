export type DriftChipTone = 'clean' | 'unsaved' | 'error';
export type DriftChip = { label: string; tone: DriftChipTone; title: string | undefined };

type DriftResult =
	| { ok: true; data: { summary: { rows: number } } }
	| { ok: false; error: { message: string } };

/**
 * Catalog header drift chip. `null` (hosted: no backup to compare) shows no
 * chip; a failed check reads "Drift unavailable", never "Matches backup".
 */
export function driftChip(drift: DriftResult | null): DriftChip | null {
	if (drift === null) return null;
	if (!drift.ok) return { label: 'Drift unavailable', tone: 'error', title: drift.error.message };
	const rows = drift.data.summary.rows;
	return rows > 0
		? { label: `${rows} unsaved`, tone: 'unsaved', title: undefined }
		: { label: 'Matches backup', tone: 'clean', title: undefined };
}
