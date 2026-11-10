import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// A missing layout reads as empty so it fails on the assertions below.
function read(path: string) {
	const file = resolve(__dirname, '../../admin/app', path);
	return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

const TOASTER_IMPORT = /import\s*\{\s*Toaster\s*\}\s*from\s*'@\/components\/ui\/sonner'/;
const TOASTER_ELEMENT = /<Toaster\s+richColors\s+position="bottom-right"\s*\/>/;

describe('toaster stays off the public pages (#250)', () => {
	it('root layout does not load the toast library', () => {
		const src = read('layout.tsx');
		expect(src).toMatch(/<html\b/);
		expect(src).not.toMatch(/@\/components\/ui\/sonner/);
		expect(src).not.toMatch(/<Toaster\b/);
	});

	it.each(['admin/layout.tsx', 'login/layout.tsx'])('%s mounts the toaster', (path) => {
		const src = read(path);
		expect(src).toMatch(TOASTER_IMPORT);
		expect(src).toMatch(TOASTER_ELEMENT);
		expect(src).toMatch(/\{children\}/);
	});
});
