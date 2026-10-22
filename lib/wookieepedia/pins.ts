/**
 * Manual Wookieepedia page pins: `data/enrichment-pins.json`, `slug → pin`.
 *
 * A pin is a git-tracked mapping REQUEST, not a write. The admin edits the file;
 * the enrichment sync (`buildMapping`) reads it and applies the pin rules there.
 * Pure (no Node APIs) so the admin, the runner and the tests share it.
 */

export const PINS_FILE = 'enrichment-pins.json';

export type EnrichmentPin = {
	readonly pageid: number;
	/** Page title when pinned (for review; the pageid is the anchor). */
	readonly title: string;
	readonly note?: string;
	/** ISO timestamp. */
	readonly pinned_at: string;
};

export type PinMap = ReadonlyMap<string, EnrichmentPin>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate a parsed pins file. Returns every valid pin plus one error per bad
 * entry; callers that write (the sync) must refuse to run when `errors` is
 * non-empty rather than act on a partial file.
 */
export function parsePins(json: unknown): { pins: Map<string, EnrichmentPin>; errors: string[] } {
	const pins = new Map<string, EnrichmentPin>();
	const errors: string[] = [];
	if (json === null || typeof json !== 'object' || Array.isArray(json)) {
		return { pins, errors: ['pins file must be a JSON object of slug → pin'] };
	}
	for (const [slug, raw] of Object.entries(json as Record<string, unknown>)) {
		if (!SLUG.test(slug)) {
			errors.push(`"${slug}": not a kebab-case slug`);
			continue;
		}
		if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
			errors.push(`${slug}: pin must be an object`);
			continue;
		}
		const r = raw as Record<string, unknown>;
		if (typeof r.pageid !== 'number' || !Number.isInteger(r.pageid) || r.pageid <= 0) {
			errors.push(`${slug}: pageid must be a positive integer`);
			continue;
		}
		if (typeof r.title !== 'string' || r.title.trim() === '') {
			errors.push(`${slug}: title must be a non-empty string`);
			continue;
		}
		if (typeof r.pinned_at !== 'string' || Number.isNaN(Date.parse(r.pinned_at))) {
			errors.push(`${slug}: pinned_at must be an ISO timestamp`);
			continue;
		}
		if (r.note !== undefined && typeof r.note !== 'string') {
			errors.push(`${slug}: note must be a string`);
			continue;
		}
		const unknown = Object.keys(r).filter(
			(k) => !['pageid', 'title', 'note', 'pinned_at'].includes(k),
		);
		if (unknown.length) {
			errors.push(`${slug}: unknown key(s) ${unknown.join(', ')}`);
			continue;
		}
		pins.set(slug, {
			pageid: r.pageid,
			title: r.title,
			...(typeof r.note === 'string' && r.note.trim() ? { note: r.note.trim() } : {}),
			pinned_at: r.pinned_at,
		});
	}
	return { pins, errors };
}

/** Stable file contents: slugs sorted, fixed key order, tab-free 2-space JSON, trailing newline. */
export function serializePins(pins: PinMap): string {
	const out: Record<string, EnrichmentPin> = {};
	for (const slug of [...pins.keys()].sort()) {
		const p = pins.get(slug) as EnrichmentPin;
		out[slug] = {
			pageid: p.pageid,
			title: p.title,
			...(p.note ? { note: p.note } : {}),
			pinned_at: p.pinned_at,
		};
	}
	return `${JSON.stringify(out, null, 2)}\n`;
}
