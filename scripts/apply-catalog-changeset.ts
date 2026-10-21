/**
 * Apply data/discovery/catalog-changeset.json to the catalog. DRY-RUN BY DEFAULT.
 *
 *   npx tsx scripts/apply-catalog-changeset.ts --production            # dry-run vs PROD (read-only)
 *   npx tsx scripts/apply-catalog-changeset.ts --production --apply    # real writes (prompts)
 *   …  --changeset <path>                                             # another changeset file
 *
 * Real writes require BOTH --apply and --production, then:
 *   1. no blocking problems (any insert with needs_type / invalid type refuses the run);
 *   2. a clean pre-flight plan (any conflict — a row changed since the build — refuses);
 *   3. typing the prod project ref (same guard as scripts/seed.ts);
 *   4. a fresh `npm run catalog:backup` (run here; refuses if it fails, or the
 *      backup file isn't fresh / doesn't hold every live row).
 *
 * Writes, in order: ISBN fixes → cover fixes → updates → inserts. ISBN fixes, cover fixes and updates
 * touch only their named columns, keyed by `id`; inserts are plain inserts
 * (never upsert-on-slug), and each slug is re-checked right before its insert.
 *
 * Partial-failure behavior (supabase-js has no client transactions): each row
 * is its own write. Every step re-reads its live row and re-plans just before
 * writing; the run STOPS at the first conflict or error. Rows already written
 * stay written — that is safe because every step is idempotent: re-running the
 * same command skips rows already in the target state and resumes at the
 * failed row. Restore point: data/catalog-backup.csv (`npm run catalog:restore`).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseCsv } from '../lib/csv/read';
import {
	type LiveState,
	type Step,
	blockingProblems,
	planAll,
	planCoverFix,
	planInsert,
	planIsbnFix,
	planUpdate,
} from '../lib/wookieepedia/apply-plan';
import type { Changeset } from '../lib/wookieepedia/changeset';
import { isLocal, makeClient, resolveCredentials } from './_supabase';

const ROOT = resolve(__dirname, '..');
const args = process.argv.slice(2);
const PROD = args.includes('--production');
const APPLY = args.includes('--apply');
const csArg = args.indexOf('--changeset');
const CHANGESET = resolve(
	ROOT,
	csArg >= 0 ? (args[csArg + 1] ?? '') : 'data/discovery/catalog-changeset.json',
);
const BACKUP = resolve(ROOT, 'data', 'catalog-backup.csv');
const BACKUP_MAX_AGE_MS = 10 * 60 * 1000;
const LIVE_COLUMNS =
	'id, slug, title, canon, isbn, primary_isbn, date_published, format, cover_image';

const supabase = makeClient(PROD);
const w = (s: string) => process.stdout.write(`${s}\n`);

async function readLive(): Promise<LiveState[]> {
	const { data, error } = await supabase.from('books').select(LIVE_COLUMNS);
	if (error) throw new Error(`live read failed: ${error.message}`);
	return (data ?? []) as LiveState[];
}

async function readOne(column: 'id' | 'slug', value: string): Promise<LiveState | null> {
	const { data, error } = await supabase
		.from('books')
		.select(LIVE_COLUMNS)
		.eq(column, value)
		.maybeSingle();
	if (error) throw new Error(`read ${column}=${value} failed: ${error.message}`);
	return (data as LiveState | null) ?? null;
}

function describe(step: Step, i: number, total: number): string {
	const mark = step.action === 'apply' ? '→' : step.action === 'skip' ? '·' : '✗';
	return `  ${mark} [${String(i + 1).padStart(3)}/${total}] ${step.kind.padEnd(9)} ${step.slug}: ${step.action.toUpperCase()} — ${step.reason}`;
}

/** Same project-ref prompt as scripts/seed.ts. Required for any non-local write. */
async function confirmTarget(url: string): Promise<void> {
	if (isLocal(url)) return;
	const ref = url.match(/https?:\/\/([^.]+)\./)?.[1] ?? url;
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question(
		`\n⚠️  About to WRITE the catalog changeset to a NON-LOCAL database:\n    ${url}\n` +
			`Type the project ref "${ref}" to continue (anything else aborts): `,
	);
	rl.close();
	if (answer.trim() !== ref) {
		console.error('Aborted — no changes written.');
		process.exit(1);
	}
}

/** Run `npm run catalog:backup` and verify it produced a fresh, complete backup. */
function backupOrRefuse(liveCount: number): void {
	w('\nRunning npm run catalog:backup …');
	const res = spawnSync('npm', ['run', 'catalog:backup'], { cwd: ROOT, stdio: 'inherit' });
	if (res.status !== 0) {
		console.error('Refusing: catalog:backup failed — no changes written.');
		process.exit(1);
	}
	let age = Number.POSITIVE_INFINITY;
	let rows = -1;
	try {
		age = Date.now() - statSync(BACKUP).mtimeMs;
		rows = parseCsv(readFileSync(BACKUP, 'utf-8')).length;
	} catch {
		// fall through to refusal
	}
	if (age > BACKUP_MAX_AGE_MS || rows !== liveCount) {
		console.error(
			`Refusing: backup not fresh/complete (age ${Math.round(age / 1000)}s, ${rows} rows vs ${liveCount} live) — no changes written.`,
		);
		process.exit(1);
	}
	w(`Backup OK: data/catalog-backup.csv (${rows} rows).`);
}

async function write(step: Step): Promise<void> {
	if (step.kind === 'insert') {
		const { data, error } = await supabase
			.from('books')
			.insert(step.patch as never)
			.select('id, slug')
			.single();
		if (error) throw new Error(`insert failed: ${error.code ?? ''} ${error.message}`);
		if (data?.slug !== step.slug) throw new Error('insert returned an unexpected row');
		return;
	}
	const { data, error } = await supabase
		.from('books')
		.update(step.patch as never)
		.eq('id', step.id as string)
		.eq('slug', step.slug)
		.select('id');
	if (error) throw new Error(`update failed: ${error.message}`);
	if ((data ?? []).length !== 1)
		throw new Error(`update matched ${(data ?? []).length} rows, expected 1`);
}

/** Re-read the step's live row and re-plan it immediately before writing (TOCTOU). */
async function replan(cs: Changeset, step: Step): Promise<Step> {
	if (step.kind === 'insert') {
		const ins = cs.inserts.find((i) => i.slug === step.slug);
		return planInsert(ins as Changeset['inserts'][number], await readOne('slug', step.slug));
	}
	const live = await readOne('id', step.id as string);
	if (step.kind === 'cover_fix') {
		return planCoverFix(
			cs.cover_fixes.find((c) => c.id === step.id) as Changeset['cover_fixes'][number],
			live,
		);
	}
	if (step.kind === 'isbn_fix') {
		return planIsbnFix(
			cs.isbn_fixes.find((f) => f.id === step.id) as Changeset['isbn_fixes'][number],
			live,
		);
	}
	return planUpdate(cs.updates.find((u) => u.id === step.id) as Changeset['updates'][number], live);
}

async function main(): Promise<void> {
	const { url } = resolveCredentials(PROD);
	const cs = JSON.parse(readFileSync(CHANGESET, 'utf-8')) as Changeset;
	const live = await readLive();
	const plan = planAll(cs, live);
	const problems = blockingProblems(cs);

	w(`\n═══ Catalog changeset ${APPLY ? 'APPLY' : 'DRY-RUN'} ═══`);
	w(
		`Target: ${isLocal(url) ? 'LOCAL' : 'PRODUCTION'} (${live.length} live rows) · changeset ${CHANGESET.replace(`${ROOT}/`, '')} (as_of ${cs.as_of})`,
	);
	plan.forEach((s, i) => w(describe(s, i, plan.length)));

	const count = (kind: Step['kind'], action: Step['action']) =>
		plan.filter((s) => s.kind === kind && s.action === action).length;
	w('\nPlan:');
	for (const kind of ['isbn_fix', 'cover_fix', 'update', 'insert'] as const) {
		w(
			`  ${kind.padEnd(9)} apply ${count(kind, 'apply')} · skip ${count(kind, 'skip')} · conflict ${count(kind, 'conflict')}`,
		);
	}
	const conflicts = plan.filter((s) => s.action === 'conflict');
	if (problems.length) {
		w(`\nBLOCKED — ${problems.length} problem(s); --apply will refuse until fixed:`);
		for (const p of problems) w(`  ✗ ${p}`);
	}
	if (conflicts.length)
		w(
			`\nCONFLICTS — ${conflicts.length}; rebuild the changeset (scripts/build-catalog-changeset.ts) and re-review.`,
		);

	if (!APPLY) {
		w('\nDry-run only — nothing written. Real writes need --apply --production.');
		return;
	}
	if (!PROD) {
		console.error('Refusing: real writes require --apply --production.');
		process.exit(1);
	}
	if (problems.length || conflicts.length) {
		console.error(
			'Refusing: resolve the blocking problems / conflicts above first — no changes written.',
		);
		process.exit(1);
	}
	const todo = plan.filter((s) => s.action === 'apply');
	if (todo.length === 0) {
		w('\nNothing to apply — catalog already matches the changeset.');
		return;
	}

	await confirmTarget(url);
	backupOrRefuse(live.length);

	w(`\nWriting ${todo.length} step(s)…`);
	let done = 0;
	for (const [i, planned] of plan.entries()) {
		if (planned.action !== 'apply') continue;
		let step = planned;
		try {
			step = await replan(cs, planned);
			if (step.action === 'skip') {
				w(describe(step, i, plan.length));
				continue;
			}
			if (step.action === 'conflict') throw new Error(step.reason);
			await write(step);
			done++;
			w(
				`  ✓ [${String(i + 1).padStart(3)}/${plan.length}] ${step.kind.padEnd(9)} ${step.slug}: ${step.reason}`,
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(
				`\n✗ STOPPED at step ${i + 1}/${plan.length} (${step.kind} ${step.slug}): ${msg}`,
			);
			console.error(
				`  ${done} write(s) committed before it. Every step is idempotent — fix the cause and`,
			);
			console.error('  re-run the same command to resume (completed rows are skipped).');
			console.error('  Restore point: data/catalog-backup.csv (npm run catalog:restore).');
			process.exit(1);
		}
	}
	w(`\nDone — ${done} write(s). Run npm run catalog:backup to snapshot the result.`);
}

main().catch((err) => {
	console.error(`\n${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
});
