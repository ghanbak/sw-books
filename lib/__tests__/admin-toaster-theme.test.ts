import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// A missing file reads as empty so it fails on the assertions below.
function read(path: string) {
	const file = resolve(__dirname, '../../admin', path);
	return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

const SONNER_DARK = /<Sonner\s+theme="dark"[\s>]/;

describe('admin toasts stay dark (#252)', () => {
	it('sets the dark theme on Sonner', () => {
		expect(read('components/ui/sonner.tsx')).toMatch(SONNER_DARK);
	});

	it('does not read the theme from next-themes', () => {
		const src = read('components/ui/sonner.tsx');
		expect(src).toMatch(/<Sonner\b/);
		expect(src).not.toMatch(/next-themes/);
		expect(src).not.toMatch(/useTheme/);
	});

	it('does not list next-themes as a dependency', () => {
		const pkg = read('package.json');
		expect(pkg).toMatch(/"dependencies"/);
		expect(pkg).not.toMatch(/"next-themes"/);
	});
});
