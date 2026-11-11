import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	DEV_ADMIN_EMAIL,
	DEV_ADMIN_ID,
	buildScreenshotEnv,
	parseStatusJson,
	renderEnvFile,
} from '../../lib/admin-screenshot-env';

const ROOT = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf-8');

// Fake values shaped like `supabase status -o json` output. Not real keys.
const STATUS = {
	API_URL: 'http://127.0.0.1:54321',
	DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
	ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.anon.sig',
	SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.service.sig',
	PUBLISHABLE_KEY: 'sb_publishable_fakefakefakefake',
	SECRET_KEY: 'sb_secret_fakefakefakefakefake',
};

describe('parseStatusJson', () => {
	it('returns the string fields of a status object', () => {
		const parsed = parseStatusJson(JSON.stringify({ ...STATUS, EXTRA: 3 }));
		expect(parsed.API_URL).toBe(STATUS.API_URL);
		expect(parsed.EXTRA).toBeUndefined();
	});

	it.each(['', 'not json', '[]', 'null', '"x"'])('throws on %j', (text) => {
		expect(() => parseStatusJson(text)).toThrow();
	});
});

describe('buildScreenshotEnv', () => {
	it('points DB, prod slot and auth at the local API and allowlists the dev admin', () => {
		const vars = buildScreenshotEnv(STATUS);
		expect(vars).toEqual({
			SUPABASE_LOCAL_URL: STATUS.API_URL,
			SUPABASE_LOCAL_SERVICE_ROLE_KEY: STATUS.SECRET_KEY,
			SUPABASE_PROD_URL: STATUS.API_URL,
			SUPABASE_PROD_SERVICE_ROLE_KEY: STATUS.SECRET_KEY,
			NEXT_PUBLIC_SUPABASE_URL: STATUS.API_URL,
			NEXT_PUBLIC_SUPABASE_ANON_KEY: STATUS.PUBLISHABLE_KEY,
			ADMIN_USER_IDS: DEV_ADMIN_ID,
		});
	});

	it('falls back to the legacy key names', () => {
		const { SECRET_KEY: _s, PUBLISHABLE_KEY: _p, ...legacy } = STATUS;
		const vars = buildScreenshotEnv(legacy);
		expect(vars.SUPABASE_LOCAL_SERVICE_ROLE_KEY).toBe(STATUS.SERVICE_ROLE_KEY);
		expect(vars.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(STATUS.ANON_KEY);
	});

	it.each(['http://localhost:54321', 'http://[::1]:54321'])('accepts loopback %s', (url) => {
		expect(buildScreenshotEnv({ ...STATUS, API_URL: url }).NEXT_PUBLIC_SUPABASE_URL).toBe(url);
	});

	it.each([
		'https://abcdefgh.supabase.co',
		'http://localhost.example.com:54321',
		'https://127.0.0.1.example.com',
		'https://localhost@abcdefgh.supabase.co',
		'http://192.168.1.10:54321',
		'not a url',
	])('refuses non-local API_URL %s', (url) => {
		expect(() => buildScreenshotEnv({ ...STATUS, API_URL: url })).toThrow(/non-local/i);
	});

	it('refuses when the API URL is missing', () => {
		const { API_URL: _a, ...rest } = STATUS;
		expect(() => buildScreenshotEnv(rest)).toThrow(/API_URL/);
	});

	it('refuses when a key is missing', () => {
		expect(() =>
			buildScreenshotEnv({ API_URL: STATUS.API_URL, ANON_KEY: STATUS.ANON_KEY }),
		).toThrow(/secret/i);
		expect(() =>
			buildScreenshotEnv({ API_URL: STATUS.API_URL, SECRET_KEY: STATUS.SECRET_KEY }),
		).toThrow(/publishable/i);
	});

	it.each(['a b', 'a\nB=evil', 'a"b', ''])('refuses a malformed key %j', (key) => {
		expect(() =>
			buildScreenshotEnv({ ...STATUS, SECRET_KEY: key, SERVICE_ROLE_KEY: key }),
		).toThrow();
	});
});

describe('renderEnvFile', () => {
	it('writes one KEY=value line per var after a header, and every URL is local', () => {
		const text = renderEnvFile(buildScreenshotEnv(STATUS));
		const lines = text.split('\n').filter((l) => l && !l.startsWith('#'));
		expect(lines).toHaveLength(7);
		expect(lines).toContain(`ADMIN_USER_IDS=${DEV_ADMIN_ID}`);
		for (const line of lines.filter((l) => l.includes('_URL='))) {
			expect(line.split('=')[1]).toBe(STATUS.API_URL);
		}
		expect(text.startsWith('#')).toBe(true);
		expect(text.endsWith('\n')).toBe(true);
	});
});

describe('wiring', () => {
	it('the local seed creates the dev admin with the allowlisted id and email', () => {
		const seed = read('supabase/seed.sql');
		expect(seed).toContain(DEV_ADMIN_ID);
		expect(seed).toContain(DEV_ADMIN_EMAIL);
		expect(seed).toMatch(/insert\s+into\s+auth\.identities/i);
	});

	it('config.toml seeds from supabase/seed.sql', () => {
		expect(read('supabase/config.toml')).toMatch(/sql_paths\s*=\s*\["\.\/seed\.sql"\]/);
	});

	it('npm run admin:screenshot-env runs the writer script', () => {
		const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
		expect(pkg.scripts['admin:screenshot-env']).toContain('scripts/admin-screenshot-env.ts');
	});

	it('the writer script guards via buildScreenshotEnv and writes the gitignored file', () => {
		const src = read('scripts/admin-screenshot-env.ts');
		expect(src).toMatch(/buildScreenshotEnv\(\s*/);
		expect(src).toContain('.env.screenshots.local');
		expect(read('.gitignore').split('\n')).toContain('.env.*');
	});

	it('the login page offers dev sign-in only when auth points at a local stack', () => {
		const page = read('admin/app/login/page.tsx');
		expect(page).toMatch(/isLocalUrl\(\s*/);
		expect(page).toContain('<DevSignInForm');
	});
});
