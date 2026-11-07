import { describe, expect, it } from 'vitest';
import { isLocal } from '../_supabase';

// isLocal gates the catalog scripts' prod project-ref prompt; a false positive skips it.
describe('isLocal (catalog scripts target check)', () => {
	it.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321'])(
		'treats %s as local',
		(url) => {
			expect(isLocal(url)).toBe(true);
		},
	);

	it.each([
		'http://localhost.example.com',
		'https://127.0.0.1.example.com',
		'https://abcdefgh.supabase.co/127.0.0.1',
		'https://localhost@abcdefgh.supabase.co',
		'https://abcdefgh.supabase.co',
	])('treats %s as non-local', (url) => {
		expect(isLocal(url)).toBe(false);
	});

	it('fails closed on an unparseable URL', () => {
		expect(isLocal('localhost:54321 not a url')).toBe(false);
		expect(isLocal('')).toBe(false);
	});
});
