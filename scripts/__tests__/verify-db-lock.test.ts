import { execFileSync, spawn } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, '../verify-db.sh');
const BUSY = /verify-db lock busy/;
const HOUR_MS = 3_600_000;
const RACERS = 8;
// Only the unpatched script sleeps after its last try, so this covers the fail-before run.
const TEST_TIMEOUT = 40_000;

// `docker info` fails, then the `open` stub fails, so a run that got the lock stops under `set -e`
// before the script's BSD-only `sed -i ''`. Same path on macOS and Linux.
const LOGGING_STUB = `#!/bin/sh
echo "$(basename "$0") $*" >>"$VERIFY_STUB_LOG"
exit 1
`;
const DOCKER_STUB = `#!/bin/sh
echo "docker $*" >>"$VERIFY_STUB_LOG"
if [ -n "$VERIFY_STUB_HOLD" ]; then
	i=0
	while [ ! -e "$VERIFY_STUB_HOLD" ] && [ "$i" -lt 400 ]; do sleep 0.05; i=$((i + 1)); done
fi
if [ -n "$VERIFY_STUB_DOCKER_UP" ]; then exit 0; fi
exit 1
`;
// Frees the lock during the script's wait between tries.
const FREE_LOCK_SLEEP_STUB = `#!/bin/sh
rm -rf "$VERIFY_DB_LOCK"
`;
// With Docker up, a run gets past readiness: macOS then fails at the \`supabase start\` stub, Linux at BSD-only sed.
const DOCKER_UP = { VERIFY_STUB_DOCKER_UP: '1' };
const STOP = 'supabase stop --project-id ossus-archives-verify --no-backup';

type RunResult = { status: number | null; stderr: string };

let sandbox: string;
let stubs: string;
let worktree: string;
let config: string;
let originalConfig: string;
let dir: string;
let lock: string;
let log: string;
let release: string;

function git(cwd: string, ...args: string[]) {
	execFileSync('git', args, { cwd, env: scriptEnv(), stdio: 'pipe' });
}

function scriptEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const key of Object.keys(env)) {
		if (key.startsWith('GIT_')) delete env[key];
	}
	return { ...env, PATH: `${stubs}:${process.env.PATH}`, ...extra };
}

function run(extra: Record<string, string> = {}): Promise<RunResult> {
	return new Promise((done, fail) => {
		const child = spawn('bash', [SCRIPT], {
			cwd: worktree,
			env: scriptEnv({
				VERIFY_DB_LOCK: lock,
				VERIFY_DB_LOCK_TRIES: '1',
				VERIFY_STUB_LOG: log,
				...extra,
			}),
			stdio: ['ignore', 'ignore', 'pipe'],
		});
		let stderr = '';
		child.stderr.on('data', (chunk) => {
			stderr += String(chunk);
		});
		child.on('error', fail);
		child.on('close', (status) => done({ status, stderr }));
	});
}

function calls(): string[] {
	if (!existsSync(log)) return [];
	return readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
}

function stopCalls(): string[] {
	return calls().filter((call) => call.startsWith('supabase stop'));
}

function callsBeforeStart(): string[] {
	const all = calls();
	const start = all.findIndex((call) => call.startsWith('supabase start'));
	return start === -1 ? all : all.slice(0, start);
}

function holdLock({ ageHours, owner }: { ageHours: number; owner?: string }) {
	mkdirSync(lock);
	if (owner !== undefined) writeFileSync(join(lock, 'owner'), owner);
	age(lock, ageHours);
}

function age(path: string, hours: number) {
	const then = new Date(Date.now() - hours * HOUR_MS);
	utimesSync(path, then, then);
}

async function waitFor(condition: () => boolean, ms = 15_000): Promise<boolean> {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (condition()) return true;
		await new Promise((tick) => setTimeout(tick, 25));
	}
	return condition();
}

function expectConfigRestored() {
	expect(readFileSync(config, 'utf8')).toBe(originalConfig);
	expect(existsSync(`${config}.verify-bak`)).toBe(false);
}

function expectProceededAndReleased(result: RunResult) {
	expect(result.status).toBe(1);
	expect(result.stderr).not.toMatch(BUSY);
	expect(calls()).toContain('docker info');
	expect(calls().some((call) => call.startsWith('supabase stop'))).toBe(true);
	expect(existsSync(lock)).toBe(false);
	expectConfigRestored();
}

describe('scripts/verify-db.sh lock', { timeout: TEST_TIMEOUT }, () => {
	beforeAll(() => {
		sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'verify-db-lock-')));
		stubs = join(sandbox, 'bin');
		mkdirSync(stubs);
		for (const [name, body] of [
			['supabase', LOGGING_STUB],
			['open', LOGGING_STUB],
			['docker', DOCKER_STUB],
		] as const) {
			writeFileSync(join(stubs, name), body);
			chmodSync(join(stubs, name), 0o755);
		}

		// The script refuses a main checkout, and CI runs in one, so give it a real linked worktree.
		const repo = join(sandbox, 'repo');
		originalConfig = 'project_id = "ossus-archives"\nport = 54321\n';
		mkdirSync(join(repo, 'supabase'), { recursive: true });
		writeFileSync(join(repo, 'supabase/config.toml'), originalConfig);
		git(sandbox, 'init', '-q', repo);
		git(repo, 'add', '.');
		git(
			repo,
			'-c',
			'user.name=verify-db-test',
			'-c',
			'user.email=verify-db-test@example.invalid',
			'-c',
			'commit.gpgsign=false',
			'commit',
			'-q',
			'-m',
			'init',
		);
		worktree = join(sandbox, 'wt');
		git(repo, 'worktree', 'add', '-q', '--detach', worktree);
		config = join(worktree, 'supabase/config.toml');
	});

	afterAll(() => {
		rmSync(sandbox, { recursive: true, force: true });
	});

	beforeEach(() => {
		dir = mkdtempSync(join(sandbox, 'case-'));
		lock = join(dir, 'verify.lock');
		log = join(dir, 'calls.log');
		release = join(dir, 'release');
	});

	it('exits busy without touching a lock held by a live run', async () => {
		holdLock({ ageHours: 2, owner: 'other run\n' });

		const result = await run();

		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(BUSY);
		expect(calls()).toEqual([]);
		expect(readFileSync(join(lock, 'owner'), 'utf8')).toBe('other run\n');
		expectConfigRestored();
	});

	it('exits busy and keeps a recent lock that has no owner file', async () => {
		holdLock({ ageHours: 2 });

		const result = await run();

		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(BUSY);
		expect(calls()).toEqual([]);
		expect(existsSync(lock)).toBe(true);
		expectConfigRestored();
	});

	it('steals a lock older than 3 hours and proceeds', async () => {
		holdLock({ ageHours: 4, owner: 'crashed run\n' });

		const result = await run();

		expect(result.stderr).toMatch(/stale lock/);
		expectProceededAndReleased(result);
	});

	it('steals an old lock that has no owner file', async () => {
		holdLock({ ageHours: 4 });

		const result = await run();

		expect(result.stderr).toMatch(/stale lock/);
		expectProceededAndReleased(result);
	});

	it('steals past a mutex left by a crashed stealer', async () => {
		holdLock({ ageHours: 4, owner: 'crashed run\n' });
		mkdirSync(`${lock}.steal`);
		age(`${lock}.steal`, 4);

		const result = await run();

		expectProceededAndReleased(result);
		expect(existsSync(`${lock}.steal`)).toBe(false);
	});

	it('acquires a free lock and releases it', async () => {
		expectProceededAndReleased(await run());
	});

	it('stops a crashed run stack after Docker is up and before starting', async () => {
		holdLock({ ageHours: 4, owner: 'crashed run\n' });

		const result = await run(DOCKER_UP);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toMatch(/stale lock/);
		// One stop clears the crashed stack; the other is the EXIT trap's. The stub exits 1, so failure is tolerated.
		expect(stopCalls()).toEqual([STOP, STOP]);
		expect(callsBeforeStart().slice(0, 2)).toEqual(['docker info', STOP]);
		expect(calls().some((call) => call.startsWith('supabase start'))).toBe(
			process.platform === 'darwin',
		);
		expect(existsSync(lock)).toBe(false);
		expectConfigRestored();
	});

	it('makes no extra stop after acquiring a free lock', async () => {
		const result = await run(DOCKER_UP);

		expect(result.status).not.toBe(0);
		// Only the EXIT trap's stop: a pre-start stop would make two.
		expect(stopCalls()).toEqual([STOP]);
		expect(existsSync(lock)).toBe(false);
		expectConfigRestored();
	});

	it('makes no extra stop when a steal attempt lost and a later try got a free lock', async () => {
		holdLock({ ageHours: 4, owner: 'crashed run\n' });
		mkdirSync(`${lock}.steal`); // fresh, so the steal attempt on the first try loses
		const sleepStubs = join(dir, 'bin');
		mkdirSync(sleepStubs);
		writeFileSync(join(sleepStubs, 'sleep'), FREE_LOCK_SLEEP_STUB);
		chmodSync(join(sleepStubs, 'sleep'), 0o755);

		const result = await run({
			...DOCKER_UP,
			VERIFY_DB_LOCK_TRIES: '2',
			PATH: `${sleepStubs}:${stubs}:${process.env.PATH}`,
		});

		expect(result.stderr).not.toMatch(BUSY);
		expect(result.stderr).not.toMatch(/stale lock/);
		expect(stopCalls()).toEqual([STOP]);
		expect(existsSync(lock)).toBe(false);
		expectConfigRestored();
	});

	it('records an owner file while it holds the lock', async () => {
		const running = run({ VERIFY_STUB_HOLD: release });
		await waitFor(() => calls().includes('docker info'));
		const owner = readFileSync(join(lock, 'owner'), 'utf8');
		writeFileSync(release, '');

		expect(owner).toMatch(/pid=\d+/);
		expectProceededAndReleased(await running);
	});

	it('leaves the lock and stack alone after another run stole it', async () => {
		const running = run({ VERIFY_STUB_HOLD: release });
		await waitFor(() => calls().includes('docker info'));
		writeFileSync(join(lock, 'owner'), 'thief\n');
		writeFileSync(release, '');

		await running;

		expect(calls().some((call) => call.startsWith('supabase stop'))).toBe(false);
		expect(readFileSync(join(lock, 'owner'), 'utf8')).toBe('thief\n');
		expectConfigRestored();
	});

	it('lets exactly one of several concurrent runs steal a stale lock', async () => {
		holdLock({ ageHours: 4, owner: 'crashed run\n' });

		let exited = 0;
		const runs = Array.from({ length: RACERS }, () =>
			run({ VERIFY_STUB_HOLD: release }).then((result) => {
				exited += 1;
				return result;
			}),
		);
		// The winner parks in the docker stub, so a loser cannot acquire the lock after it is released.
		await waitFor(() => exited >= RACERS - 1);
		writeFileSync(release, '');
		const results = await Promise.all(runs);

		expect(calls().filter((call) => call.startsWith('docker'))).toEqual(['docker info']);
		expect(results.filter((result) => BUSY.test(result.stderr))).toHaveLength(RACERS - 1);
		expect(existsSync(lock)).toBe(false);
		expectConfigRestored();
	});

	it('keeps the default lock path and wait count', () => {
		const source = readFileSync(SCRIPT, 'utf8');

		expect(source).toContain('${VERIFY_DB_LOCK:-/tmp/sw-books-verify-db.lock}');
		expect(source).toContain('${VERIFY_DB_LOCK_TRIES:-90}');
	});
});
