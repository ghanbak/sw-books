/**
 * Scan-screen mode + its persisted form. Pure (no React/native imports) so the
 * stored-value parsing unit-tests in the node vitest env, mirroring `lib/sort.ts`.
 */

export type ScanMode = 'barcode' | 'shelf';

/** Default when nothing is stored: shelf is the headline experience (plan Phase 5). */
export const DEFAULT_SCAN_MODE: ScanMode = 'shelf';

const VALID: ReadonlySet<string> = new Set<ScanMode>(['barcode', 'shelf']);

/** Coerce a persisted value (or anything) to a valid mode, falling back to the default. */
export function parseStoredScanMode(raw: string | null | undefined): ScanMode {
	return raw && VALID.has(raw) ? (raw as ScanMode) : DEFAULT_SCAN_MODE;
}
