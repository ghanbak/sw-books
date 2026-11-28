import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Source-level guard: reads the admin pages as text so CI's app job needs no admin deps.
const read = (path: string) => {
	const p = resolve(__dirname, '../../admin/app', path);
	return existsSync(p) ? readFileSync(p, 'utf8') : '';
};

// JSX wraps copy across lines; collapse whitespace so phrases match.
const text = (src: string) => src.replace(/\s+/g, ' ');

// The body of one <Section title="..."> up to the next Section.
const section = (src: string, title: string) => {
	const start = src.indexOf(`<Section title="${title}">`);
	if (start === -1) return '';
	const end = src.indexOf('</Section>', start);
	return text(src.slice(start, end === -1 ? undefined : end));
};

describe('privacy policy lists what the app collects (#422)', () => {
	const src = read('privacy/page.tsx');
	const collected = section(src, 'Information we collect');
	const providers = section(src, 'Service providers');
	const deletion = section(src, 'Data retention and deletion');

	it('lists the Apple full name', () => {
		expect(collected).toMatch(/Sign in with Apple asks for your name/);
		expect(collected).toMatch(/we store it with your account/);
	});

	it('lists the favorite shelf flag', () => {
		expect(collected).toMatch(/owned, read, want to read, favorite/);
	});

	it('lists the per-install update ID sent to Expo', () => {
		expect(collected).toMatch(/sends Expo a random ID created for this installation/);
		expect(collected).toMatch(/not linked to your account/);
	});

	it('names Expo as a service provider', () => {
		expect(providers).toMatch(/<strong className="text-foreground">Expo<\/strong>/);
		expect(providers).toMatch(/app update delivery/);
	});

	it('names the Account sheet in the delete steps', () => {
		expect(deletion).toMatch(/open the Account sheet/);
		expect(deletion).not.toMatch(/Account → Delete account/);
	});
});

describe('support page matches the privacy policy (#422)', () => {
	const src = read('support/page.tsx');

	it('lists the name in the data it keeps', () => {
		expect(section(src, 'What data do you keep?')).toMatch(/your name if you share it/);
	});

	it('names the Account sheet in the delete steps', () => {
		const deletion = section(src, 'How do I delete my account?');
		expect(deletion).toMatch(/open the Account sheet/);
		expect(deletion).not.toMatch(/Account → Delete account/);
	});
});
