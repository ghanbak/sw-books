/**
 * Whether a cover face shows the starfield no-cover fallback instead of the image.
 *
 * The face remembers *which* URI failed to load, not just that one did. FlashList recycles
 * row components (state survives, props change), so a plain `errored` boolean would stick
 * to the next book scrolled into the row and hide its cover. Keying the failure to the URI
 * makes the fallback reset by itself when the row gets a different cover.
 */
export function showsCoverFallback(coverUri: string | null, failedUri: string | null): boolean {
	return !coverUri || failedUri === coverUri;
}
