import type { Result } from '@/lib/result';
import type { OcrFragment } from '@/lib/spine-match';

/**
 * On-device OCR boundary. Kept camera-agnostic so the matcher (`lib/spine-match.ts`) is
 * identical whether v1 runs OCR on captured stills or a future version runs it on live
 * frames. The native engine is wired in Phase 0/3 (VisionCamera `PhotoRecognizer`, or the
 * `@react-native-ml-kit/text-recognition` fallback) — Phase 0 pins which one and adapts
 * its output to `OcrFragment[]` here, so nothing downstream changes.
 */
export type { OcrFragment } from '@/lib/spine-match';

export type OcrErrorCode = 'no_text' | 'engine_error' | 'unsupported';

/** Recognizes spine text in a captured still and adapts it to the matcher's input shape. */
export type RecognizeImage = (
	uri: string,
) => Promise<Result<OcrFragment[], { code: OcrErrorCode; message: string }>>;
