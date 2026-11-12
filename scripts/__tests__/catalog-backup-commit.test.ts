import { execFileSync, spawnSync } from 'node:child_process';
import {
	chmodSync,
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, '../catalog-backup.sh');
const CSV = 'data/catalog-backup.csv';

// Seam: the real script is copied into a throwaway repo (it `cd`s to its own parent dir) and
// `npx` is stubbed on PATH, so the production export never runs. The stub only writes the CSV
// body from $BACKUP_STUB_CSV. The temp repo also has no export script or .env to fall back on.
const NPX_STUB = `#!/bin/sh
echo "npx $*" >>"$BACKUP_STUB_LOG"
printf '%s' "$BACKUP_STUB_CSV" >data/catalog-backup.csv
`;

let sandbox: string;
let repo: string;
let stubs: string;
let log: string;

function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const key of Object.keys(env)) {
		if (key.startsWith('GIT_')) delete env[key];
	}
	return { ...env, ...extra };
}

function git(...args: string[]): string {
	return execFileSync('git', args, { cwd: repo, env: cleanEnv(), encoding: 'utf8', stdio: 'pipe' });
}

function runBackup(csv: string) {
	return spawnSync('bash', [join(repo, 'scripts/catalog-backup.sh')], {
		cwd: repo,
		env: cleanEnv({
			PATH: `${stubs}:${process.env.PATH}`,
			BACKUP_STUB_CSV: csv,
			BACKUP_STUB_LOG: log,
		}),
		encoding: 'utf8',
	});
}

function commitCount(): number {
	return Number(git('rev-list', '--count', 'HEAD').trim());
}

function filesIn(rev: string): string[] {
	return git('show', '--name-only', '--format=', rev).trim().split('\n').filter(Boolean);
}

function staged(): string[] {
	return git('diff', '--cached', '--name-only').trim().split('\n').filter(Boolean);
}

describe('scripts/catalog-backup.sh commit step', () => {
	beforeEach(() => {
		sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'catalog-backup-')));
		repo = join(sandbox, 'repo');
		stubs = join(sandbox, 'bin');
		log = join(sandbox, 'calls.log');
		mkdirSync(stubs);
		writeFileSync(join(stubs, 'npx'), NPX_STUB);
		chmodSync(join(stubs, 'npx'), 0o755);

		mkdirSync(join(repo, 'scripts'), { recursive: true });
		mkdirSync(join(repo, 'data'));
		copyFileSync(SCRIPT, join(repo, 'scripts/catalog-backup.sh'));
		writeFileSync(join(repo, CSV), 'slug,title\na,A\n');
		writeFileSync(join(repo, 'other.ts'), 'export const a = 1;\n');

		execFileSync('git', ['init', '-q', repo], { env: cleanEnv(), stdio: 'pipe' });
		git('config', 'user.name', 'catalog-backup-test');
		git('config', 'user.email', 'catalog-backup-test@example.invalid');
		git('config', 'commit.gpgsign', 'false');
		git('config', 'core.hooksPath', '/dev/null');
		git('add', '.');
		git('commit', '-q', '-m', 'init');
	});

	afterEach(() => {
		rmSync(sandbox, { recursive: true, force: true });
	});

	it('commits only the backup CSV and leaves other staged paths staged', () => {
		writeFileSync(join(repo, 'other.ts'), 'export const a = 2;\n');
		writeFileSync(join(repo, 'new-migration.sql'), 'select 1;\n');
		git('add', 'other.ts', 'new-migration.sql');

		const result = runBackup('slug,title\na,A\nb,B\n');

		expect(result.status).toBe(0);
		expect(readFileSync(log, 'utf8')).toContain('npx tsx scripts/export-db-to-csv.ts --production');
		expect(commitCount()).toBe(2);
		expect(filesIn('HEAD')).toEqual([CSV]);
		expect(git('show', `HEAD:${CSV}`)).toBe('slug,title\na,A\nb,B\n');
		expect(staged().sort()).toEqual(['new-migration.sql', 'other.ts']);
		expect(git('show', 'HEAD:other.ts')).toBe('export const a = 1;\n');
	});

	it('commits a first-time backup CSV without sweeping in staged files', () => {
		git('rm', '-q', '--cached', CSV);
		git('commit', '-q', '-m', 'untrack backup');
		writeFileSync(join(repo, 'other.ts'), 'export const a = 3;\n');
		git('add', 'other.ts');

		const result = runBackup('slug,title\nc,C\n');

		expect(result.status).toBe(0);
		expect(filesIn('HEAD')).toEqual([CSV]);
		expect(staged()).toEqual(['other.ts']);
	});

	it('makes no commit when the CSV is unchanged', () => {
		writeFileSync(join(repo, 'other.ts'), 'export const a = 4;\n');
		git('add', 'other.ts');

		const result = runBackup('slug,title\na,A\n');

		expect(result.status).toBe(0);
		expect(result.stdout).toMatch(/unchanged/);
		expect(commitCount()).toBe(1);
		expect(staged()).toEqual(['other.ts']);
	});

	it('names the backup CSV as the commit pathspec', () => {
		const source = readFileSync(SCRIPT, 'utf8');

		expect(source).toMatch(/git commit[^\n]*--\s+data\/catalog-backup\.csv/);
	});
});
