import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Source guard for #333: a 'use client' file that imports supabase-js ships the
// whole client (GoTrue + Realtime) to its route. Auth calls run in server
// actions instead. Reads files as text; imports no admin module.
const ADMIN = resolve(__dirname, '../../admin');
const ROOTS = ['app', 'components'];

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return walk(path);
		return /\.(ts|tsx|js|jsx|mjs)$/.test(name) ? [path] : [];
	});
}

function read(path: string) {
	const file = join(ADMIN, path);
	return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

// The directive must be the first statement; comments may precede it.
const USE_CLIENT = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use client['"]/;
// Static value imports and re-exports. `import type` is erased at build time.
const SUPABASE_IMPORT =
	/(?:^|\n)\s*(?:import(?!\s+type\b)|export(?!\s+type\b))[^;'"]*?\bfrom\s*['"]@supabase\/(?:ssr|supabase-js)(?:\/[^'"]*)?['"]|(?:^|\n)\s*import\s*['"]@supabase\/(?:ssr|supabase-js)(?:\/[^'"]*)?['"]/;

const clientFiles = ROOTS.flatMap((root) => walk(join(ADMIN, root)))
	.filter((file) => USE_CLIENT.test(readFileSync(file, 'utf8')))
	.map((file) => relative(ADMIN, file));

describe('admin client components do not bundle supabase-js (#333)', () => {
	it('finds the login client components', () => {
		expect(clientFiles).toContain(join('app', 'login', '_components', 'sign-in-button.tsx'));
		expect(clientFiles).toContain(join('app', 'login', '_components', 'dev-sign-in-form.tsx'));
	});

	it('no client file imports @supabase/ssr or @supabase/supabase-js', () => {
		const offenders = clientFiles.filter((file) => SUPABASE_IMPORT.test(read(file)));
		expect(offenders).toEqual([]);
	});

	it('the import pattern catches the forms it must', () => {
		expect(SUPABASE_IMPORT.test("import { createBrowserClient } from '@supabase/ssr';")).toBe(true);
		expect(SUPABASE_IMPORT.test("import {\n\tcreateClient,\n} from '@supabase/supabase-js';")).toBe(
			true,
		);
		expect(SUPABASE_IMPORT.test("export { createBrowserClient } from '@supabase/ssr';")).toBe(true);
		expect(SUPABASE_IMPORT.test("import type { User } from '@supabase/supabase-js';")).toBe(false);
	});
});

describe('login sign-in runs in server actions (#333)', () => {
	const actions = read('app/_actions/auth.ts');

	it('the auth actions file is a server module using the cookie client', () => {
		expect(actions).toMatch(/^['"]use server['"]/);
		expect(actions).toMatch(/createAuthServerClient\(\s*\)/);
	});

	it('Google sign-in takes no client input and redirects to the provider URL', () => {
		expect(actions).toMatch(/export\s+async\s+function\s+signInWithGoogle\(\s*\)/);
		expect(actions).toMatch(/signInWithOAuth\(\s*\{\s*provider:\s*'google'/);
		expect(actions).toMatch(/redirectTo/);
		expect(actions).toMatch(/redirect\(\s*data\.url\s*\)/);
	});

	it('dev password sign-in refuses a non-local auth stack', () => {
		expect(actions).toMatch(/export\s+async\s+function\s+signInWithDevPassword\(/);
		expect(actions).toMatch(/isLocalUrl\(\s*config\.url\s*\)/);
		expect(actions).toMatch(/signInWithPassword\(/);
	});

	it('the login components call the actions', () => {
		const button = read('app/login/_components/sign-in-button.tsx');
		const form = read('app/login/_components/dev-sign-in-form.tsx');
		expect(button).toMatch(/import\s*\{\s*signInWithGoogle\s*\}\s*from\s*'@\/app\/_actions\/auth'/);
		expect(button).toMatch(/await\s+signInWithGoogle\(\s*\)/);
		// Errors surface inline, not via toast (#337).
		expect(button).toMatch(/setError\(\s*result\.error\.message\s*\)/);
		expect(form).toMatch(
			/import\s*\{\s*signInWithDevPassword\s*\}\s*from\s*'@\/app\/_actions\/auth'/,
		);
		expect(form).toMatch(/await\s+signInWithDevPassword\(/);
		expect(form).toMatch(/window\.location\.assign\(\s*'\/admin\/books'\s*\)/);
	});
});
