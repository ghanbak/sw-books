import { extractTextFromImage, isSupported } from 'expo-text-extractor';
import { Platform } from 'react-native';

import { type Result, err, ok } from '@/lib/result';
import type { OcrFragment } from '@/lib/spine-match';

/**
 * On-device OCR boundary. Kept camera-agnostic so the matcher (`lib/spine-match.ts`) is
 * identical regardless of engine. Engine: `expo-text-extractor` — Apple Vision
 * (`VNRecognizeTextRequest`) on iOS, ML Kit on Android, both on-device/offline.
 * Everything downstream consumes `OcrFragment[]` only.
 */
export type { OcrFragment } from '@/lib/spine-match';

export type OcrErrorCode = 'no_text' | 'engine_error' | 'unsupported';

/** Recognizes spine text in a captured still and adapts it to the matcher's input shape. */
export type RecognizeImage = (
	uri: string,
) => Promise<Result<OcrFragment[], { code: OcrErrorCode; message: string }>>;

/**
 * `extractTextFromImage` adapter: one `OcrFragment` per recognized text string (Vision /
 * ML Kit return per-line strings). Spine text wraps and tilts and the matcher pools
 * fragments into one bag anyway, so per-string is the most granular safe unit. Box/line
 * geometry is deliberately not carried in v1 (plan Phase 1).
 *
 * @param uri `file://` URI of a captured still (the caller owns the file's lifecycle).
 */
export const recognizeImage: RecognizeImage = async (uri) => {
	if (!isSupported) {
		return err({ code: 'unsupported', message: `No on-device OCR on ${Platform.OS}.` });
	}
	try {
		const texts = await extractTextFromImage(uri);
		const fragments = texts
			.map((text) => ({ text: text ?? '' }))
			.filter((fragment) => fragment.text.trim().length > 0);
		if (fragments.length === 0) {
			return err({ code: 'no_text', message: 'No readable text in this photo.' });
		}
		return ok(fragments);
	} catch (cause) {
		return err({
			code: 'engine_error',
			message: cause instanceof Error ? cause.message : String(cause),
		});
	}
};
