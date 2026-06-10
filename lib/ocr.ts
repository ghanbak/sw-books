import { Platform } from 'react-native';
import { PhotoRecognizer } from 'react-native-vision-camera-ocr-plus';

import { type Result, err, ok } from '@/lib/result';
import type { OcrFragment } from '@/lib/spine-match';

/**
 * On-device OCR boundary. Kept camera-agnostic so the matcher (`lib/spine-match.ts`) is
 * identical whether v1 runs OCR on captured stills or a future version runs it on live
 * frames. Phase 0 pinned the engine: VisionCamera v5's `PhotoRecognizer` (ML Kit via
 * Nitro) — validated end-to-end on the spike (`docs/plans/…-spine-scanner-plan.md`,
 * Phase 0 verdict). Everything downstream consumes `OcrFragment[]` only.
 */
export type { OcrFragment } from '@/lib/spine-match';

export type OcrErrorCode = 'no_text' | 'engine_error' | 'unsupported';

/** Recognizes spine text in a captured still and adapts it to the matcher's input shape. */
export type RecognizeImage = (
	uri: string,
) => Promise<Result<OcrFragment[], { code: OcrErrorCode; message: string }>>;

/**
 * `PhotoRecognizer` adapter: one `OcrFragment` per recognized LINE (not block — spine
 * text wraps and tilts, and the matcher pools fragments into one bag anyway, so lines
 * are the most granular safe unit). `box`/`line` geometry is deliberately not carried
 * in v1 (plan Phase 1).
 *
 * @param uri `file://` URI of a captured still (the caller owns the file's lifecycle).
 */
export const recognizeImage: RecognizeImage = async (uri) => {
	if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
		return err({ code: 'unsupported', message: `No on-device OCR on ${Platform.OS}.` });
	}
	try {
		const result = await PhotoRecognizer({ uri });
		const fragments = result.blocks.flatMap((block) =>
			block.lines
				// `lineText` is typed non-optional, but it crosses the Nitro/JSI bridge from
				// native ML Kit — coalesce rather than crash the bag on a null leak.
				.map((line) => ({ text: line.lineText ?? '' }))
				.filter((fragment) => fragment.text.trim().length > 0),
		);
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
