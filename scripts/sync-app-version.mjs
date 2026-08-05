#!/usr/bin/env node
// Runs in the `version` npm lifecycle (during `npm version major|minor|patch`):
// copies the freshly-bumped package.json version into app.json's `expo.version` so the
// two never drift, then stages app.json so it lands in the version commit.
//
// package.json is the single source of truth for the marketing version. The in-app About
// screen reads it via expo-constants (Constants.expoConfig.version), and EAS owns the build
// number separately (eas.json `appVersionSource: "remote"`).
//
// The replace is targeted (only the version string changes) so app.json formatting is
// preserved byte-for-byte.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const raw = readFileSync('app.json', 'utf8');
const updated = raw.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`);

if (updated === raw) {
	console.log(`app.json already at ${version}`);
} else {
	writeFileSync('app.json', updated);
	console.log(`✓ app.json expo.version → ${version}`);
}
execSync('git add app.json', { stdio: 'inherit' });
