import { beforeEach, describe, expect, it, vi } from 'vitest';

// `lib/ocr.ts` imports `react-native` (Platform — used only in the unsupported message)
// and the native `expo-text-extractor`; both must be mocked under vitest's node env.
// `supported.value` toggles the `isSupported` getter per test (it's a live-binding import
// read at call time inside recognizeImage).
const { extractTextFromImage, supported } = vi.hoisted(() => ({
	extractTextFromImage: vi.fn<(uri: string) => Promise<string[]>>(),
	supported: { value: true },
}));

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-text-extractor', () => ({
	get isSupported() {
		return supported.value;
	},
	extractTextFromImage,
}));

import { recognizeImage } from '@/lib/ocr';

describe('recognizeImage', () => {
	beforeEach(() => {
		supported.value = true;
		extractTextFromImage.mockReset();
	});

	it('maps each recognized string to one fragment, dropping blank/whitespace lines', async () => {
		extractTextFromImage.mockResolvedValue(['Dune', '   ', 'Heir to the Empire', '']);
		const result = await recognizeImage('file:///still.jpg');
		expect(extractTextFromImage).toHaveBeenCalledWith('file:///still.jpg');
		expect(result).toEqual({
			ok: true,
			data: [{ text: 'Dune' }, { text: 'Heir to the Empire' }],
		});
	});

	it('returns no_text when nothing readable was recognized', async () => {
		extractTextFromImage.mockResolvedValue(['', '   ']);
		const result = await recognizeImage('file:///blank.jpg');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe('no_text');
	});

	it('returns engine_error with the cause message when the recognizer throws', async () => {
		extractTextFromImage.mockRejectedValue(new Error('vision boom'));
		const result = await recognizeImage('file:///bad.jpg');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe('engine_error');
			expect(result.error.message).toBe('vision boom');
		}
	});

	it('returns unsupported without invoking the engine when OCR is unavailable', async () => {
		supported.value = false;
		const result = await recognizeImage('file:///x.jpg');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe('unsupported');
		expect(extractTextFromImage).not.toHaveBeenCalled();
	});
});
