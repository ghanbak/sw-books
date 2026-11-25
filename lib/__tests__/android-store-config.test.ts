import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #415: the app never records video, so Android ships without RECORD_AUDIO. The expo-camera
// plugin adds it by default (`recordAudioAndroid` defaults to true), so both places must opt out.
const ROOT = resolve(__dirname, '..', '..');

function readJson(rel: string) {
	return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
}

const app = readJson('app.json').expo;
const eas = readJson('eas.json');

describe('Android store config', () => {
	it('does not request RECORD_AUDIO', () => {
		expect(app.android.permissions).toContain('android.permission.CAMERA');
		expect(app.android.permissions).not.toContain('android.permission.RECORD_AUDIO');
	});

	it('turns off the expo-camera RECORD_AUDIO default', () => {
		const entry = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-camera');
		expect(entry).toBeDefined();
		expect(entry[1].recordAudioAndroid).toBe(false);
	});

	it('submits Android to the internal track as a draft with a key file outside the repo', () => {
		const android = eas.submit?.production?.android;
		expect(android).toBeDefined();
		expect(android.track).toBe('internal');
		expect(android.releaseStatus).toBe('draft');
		expect(android.serviceAccountKeyPath).toMatch(/^\.\/\.secrets\/[\w-]+\.json$/);
		const gitignore = readFileSync(resolve(ROOT, '.gitignore'), 'utf8');
		expect(gitignore.split('\n')).toContain('/.secrets/');
	});

	it('keeps key material out of eas.json', () => {
		const raw = readFileSync(resolve(ROOT, 'eas.json'), 'utf8');
		expect(raw).not.toMatch(/private_key|BEGIN [A-Z ]*PRIVATE KEY|client_email/);
	});
});
