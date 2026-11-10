import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');
const readIfPresent = (path: string) => {
	try {
		return source(path);
	} catch {
		return '';
	}
};

describe('shelf queue wiring', () => {
	const hook = source('hooks/useShelfScan.ts');
	const layout = source('app/_layout.tsx');
	const capture = source('components/shelf-scan-capture.tsx');
	const hooks = source('lib/hooks.tsx');
	const sync = readIfPresent('components/shelf-queue-sync.tsx');

	it('the scan hook queues only connectivity failures, for the still-current user', () => {
		expect(hook).toMatch(/result\.error\.code\s*===\s*ADD_OFFLINE_CODE/);
		expect(hook).toMatch(/ownerId\s*===\s*userIdRef\.current/);
		expect(hook).toMatch(/shelfQueue\.enqueue\(\s*ownerId,\s*ids\s*\)/);
		expect(hook).toMatch(/dispatch\(\{\s*type:\s*'add_queued'\s*\}\)/);
	});

	it('the scan hook still blocks when a failure is not queueable', () => {
		expect(hook).toMatch(/dispatch\(\{\s*type:\s*'add_blocked'\s*\}\)/);
	});

	it('the capture screen mounts the Queued state', () => {
		expect(capture).toMatch(
			/phase === 'queued' && <ShelfScanQueued count=\{scan\.queuedCount\}\s+onReset=\{scan\.reset\}/,
		);
	});

	it('the app root mounts the sync inside the auth and shelf providers', () => {
		expect(layout).toMatch(/<ShelfQueueSync\s*\/>/);
		const userBooks = layout.indexOf('<UserBooksProvider>');
		const mount = layout.indexOf('<ShelfQueueSync');
		const authGate = layout.indexOf('<AuthGate>');
		expect(userBooks).toBeGreaterThan(-1);
		expect(mount).toBeGreaterThan(userBooks);
		expect(mount).toBeLessThan(authGate); // outside the routed tree, so any screen flushes
	});

	it('the sync flushes on start and foreground, and purges other accounts', () => {
		expect(sync).toMatch(/runner\.trigger\(\);\s*const subscription/);
		expect(sync).toMatch(/status === 'active'\) runner\.trigger\(\)/);
		expect(sync).toMatch(/shelfQueue\.purgeOtherUsers\(\s*userId\s*\)/);
		expect(sync).toMatch(/runner\.stop\(\)/);
	});

	it('dropped books reach the user through an Alert', () => {
		expect(sync).toMatch(/onDropped:\s*\(bookIds\)\s*=>/);
		expect(sync).toMatch(/droppedBooksNotice\(\s*bookIds,/);
		expect(sync).toMatch(/Alert\.alert\(\s*title,\s*message\s*\)/);
	});

	it('an involuntary session end does not wipe the queue', () => {
		expect(sync).not.toMatch(/SIGNED_OUT'\)\s*void/);
		expect(sync).not.toMatch(/onAuthStateChange/);
	});

	it('deliberate sign-out clears only after it succeeds', () => {
		expect(source('app/profile.tsx')).toMatch(
			/if \(error\) Alert\.alert\('Sign-out failed', error\.message\);\s*else await shelfQueue\.clearAll\(\);/,
		);
	});

	it('account deletion clears before signing out, which can return early', () => {
		expect(source('lib/account.ts')).toMatch(
			/await shelfQueue\.clearAll\(\);\s*await supabase\.auth\.signOut\(\{ scope: 'local' \}\);/,
		);
	});

	it('the provider passes the HTTP status the classifier needs', () => {
		expect(hooks).toMatch(/return \{ rows: data, error, status \}/);
	});
});
