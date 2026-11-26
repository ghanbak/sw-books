const OPEN_LIBRARY_HOST = 'covers.openlibrary.org';
const PRH_HOST = 'images2.penguinrandomhouse.com';
const OL_LARGE = /-L\.jpg$/;
const PRH_COVER = /^\/cover\/[^/]+$/;
/** 2x of the table's 48px-tall thumbnail. */
const PRH_THUMB_HEIGHT = '96';

/**
 * Smaller rendition of a stored cover URL for the catalog table's 32×48
 * thumbnail (#470). Open Library `-L.jpg` → `-M.jpg`; PRH `/cover/<isbn>` gets
 * `height=96` unless it already sets a height or width (an explicit size is
 * kept as-is). Other hosts and unparseable values pass through. Display only:
 * the stored `cover_image` is never rewritten.
 */
export function thumbUrl(url: string | null | undefined): string | null {
	if (!url) return null;
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return url;
	}
	if (parsed.hostname === OPEN_LIBRARY_HOST && OL_LARGE.test(parsed.pathname)) {
		parsed.pathname = parsed.pathname.replace(OL_LARGE, '-M.jpg');
		return parsed.toString();
	}
	if (
		parsed.hostname === PRH_HOST &&
		PRH_COVER.test(parsed.pathname) &&
		!parsed.searchParams.has('height') &&
		!parsed.searchParams.has('width')
	) {
		parsed.searchParams.set('height', PRH_THUMB_HEIGHT);
		return parsed.toString();
	}
	return url;
}
