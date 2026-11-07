import { describe, expect, it, vi } from 'vitest';
import { exitScanTo } from './scan-exit';

describe('exitScanTo', () => {
	it('dismisses the scan modal to the target tab instead of pushing', () => {
		const router = { dismissTo: vi.fn(), push: vi.fn() };
		exitScanTo(router, '/library');
		expect(router.dismissTo).toHaveBeenCalledExactlyOnceWith('/library');
		expect(router.push).not.toHaveBeenCalled();
	});
});
