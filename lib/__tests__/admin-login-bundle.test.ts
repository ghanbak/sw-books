import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// /login First Load JS stays near /privacy (#337): no toast library in its tree.
const LOGIN_DIR = resolve(__dirname, '../../admin/app/login');

// A missing file reads as empty so it fails on the assertions below.
function read(path: string) {
	const file = join(LOGIN_DIR, path);
	return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

const SONNER_IMPORT = /from\s*['"](sonner|@\/components\/ui\/sonner)['"]/;

describe('/login does not ship the toast library (#337)', () => {
	it.each(['page.tsx', '_components/sign-in-button.tsx', '_components/dev-sign-in-form.tsx'])(
		'%s does not import sonner',
		(path) => {
			const src = read(path);
			expect(src.length).toBeGreaterThan(0);
			expect(src).not.toMatch(SONNER_IMPORT);
			expect(src).not.toMatch(/\btoast[.(]/);
		},
	);

	it('no file under admin/app/login imports sonner or mounts a Toaster', () => {
		const files = walk(LOGIN_DIR).filter((f) => /\.(tsx?|jsx?)$/.test(f));
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const src = readFileSync(file, 'utf8');
			expect(src, file).not.toMatch(SONNER_IMPORT);
			expect(src, file).not.toMatch(/<Toaster\b/);
		}
	});

	it('sign-in button shows its error inline as an alert', () => {
		const src = read('_components/sign-in-button.tsx');
		expect(src).toMatch(/role="alert"/);
		expect(src).toMatch(/setError\(\s*result\.error\.message\s*\)/);
	});
});
