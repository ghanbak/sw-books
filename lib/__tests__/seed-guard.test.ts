import { describe, expect, it } from 'vitest';
import { PROD_SEED_REFUSAL, isLocalUrl, seedRefusal } from '../seed-guard';

const ARGV = ['node', 'scripts/seed.ts'];

describe('seedRefusal', () => {
	it('refuses --production before any URL is known', () => {
		expect(seedRefusal([...ARGV, '--production'])).toBe(PROD_SEED_REFUSAL);
	});

	it('refuses --production even with --yes and a local URL', () => {
		expect(seedRefusal([...ARGV, '--production', '--yes'], 'http://127.0.0.1:54321')).toBe(
			PROD_SEED_REFUSAL,
		);
	});

	it('points prod recovery at catalog:restore', () => {
		expect(PROD_SEED_REFUSAL).toContain('npm run catalog:restore -- --production');
	});

	it('refuses a non-local SUPABASE_URL without --production', () => {
		const msg = seedRefusal(ARGV, 'https://abcdefgh.supabase.co');
		expect(msg).toContain('non-local');
		expect(msg).toContain('catalog:restore');
	});

	it.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321'])(
		'allows the local seed against %s',
		(url) => {
			expect(seedRefusal(ARGV)).toBeNull();
			expect(seedRefusal(ARGV, url)).toBeNull();
		},
	);
});

describe('isLocalUrl', () => {
	it('matches on hostname, not substring', () => {
		expect(isLocalUrl('https://localhost.example.com')).toBe(false);
		expect(isLocalUrl('https://x.supabase.co/?h=127.0.0.1')).toBe(false);
	});

	it('treats unparseable URLs as non-local', () => {
		expect(isLocalUrl('not a url')).toBe(false);
	});
});
