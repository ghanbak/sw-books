import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	type Gh,
	type IssueInfo,
	type MergedPr,
	main,
	selectIssuesToClose,
} from '../close-linked-issues.mjs';

const REPO = 'ghanbak/sw-books';
const url = (n: number, repo = REPO) => `https://github.com/${repo}/issues/${n}`;
const pr = (
	number: number,
	mergedAt: string,
	refs: { number: number; url: string }[],
): MergedPr => ({
	number,
	mergedAt,
	closingIssuesReferences: refs,
});
const open = (...reopenedAt: string[]): IssueInfo => ({
	state: 'OPEN',
	events: reopenedAt.map((created_at) => ({ event: 'reopened', created_at })),
});

const MERGED = '2026-11-10T12:00:00Z';

describe('selectIssuesToClose', () => {
	it('does not re-close an issue reopened after its PR merged', () => {
		const prs = [pr(10, MERGED, [{ number: 1, url: url(1) }])];
		const issues = { 1: open('2026-11-10T13:00:00Z') };

		expect(selectIssuesToClose({ repo: REPO, prs, issues })).toEqual([]);
	});

	it('closes an issue reopened before the merge', () => {
		const prs = [pr(10, MERGED, [{ number: 2, url: url(2) }])];
		const issues = { 2: open('2026-11-09T08:00:00Z') };

		expect(selectIssuesToClose({ repo: REPO, prs, issues })).toEqual([{ issue: 2, pr: 10 }]);
	});

	it('ignores a cross-repo closing reference with a matching number', () => {
		const prs = [pr(10, MERGED, [{ number: 3, url: url(3, 'other/repo') }])];
		const issues = { 3: open() };

		expect(selectIssuesToClose({ repo: REPO, prs, issues })).toEqual([]);
	});

	it('skips already-closed issues', () => {
		const prs = [pr(10, MERGED, [{ number: 4, url: url(4) }])];
		const issues = { 4: { state: 'CLOSED', events: [] } };

		expect(selectIssuesToClose({ repo: REPO, prs, issues })).toEqual([]);
	});

	it('closes a plain open issue once', () => {
		const prs = [pr(10, MERGED, [{ number: 5, url: url(5) }])];

		expect(selectIssuesToClose({ repo: REPO, prs, issues: { 5: open() } })).toEqual([
			{ issue: 5, pr: 10 },
		]);
	});

	it('credits the later PR when the issue was reopened between two merges', () => {
		const prs = [
			pr(10, '2026-11-09T10:00:00Z', [{ number: 6, url: url(6) }]),
			pr(11, '2026-11-11T10:00:00Z', [{ number: 6, url: url(6) }]),
		];
		const issues = { 6: open('2026-11-10T10:00:00Z') };

		expect(selectIssuesToClose({ repo: REPO, prs, issues })).toEqual([{ issue: 6, pr: 11 }]);
	});

	it('skips an issue reopened after both of its PRs merged', () => {
		const prs = [
			pr(10, '2026-11-09T10:00:00Z', [{ number: 7, url: url(7) }]),
			pr(11, '2026-11-11T10:00:00Z', [{ number: 7, url: url(7) }]),
		];
		const issues = { 7: open('2026-11-12T10:00:00Z') };

		expect(selectIssuesToClose({ repo: REPO, prs, issues })).toEqual([]);
	});

	it('ignores non-reopen events after the merge', () => {
		const prs = [pr(10, MERGED, [{ number: 8, url: url(8) }])];
		const issues = {
			8: { state: 'OPEN', events: [{ event: 'labeled', created_at: '2026-11-11T00:00:00Z' }] },
		};

		expect(selectIssuesToClose({ repo: REPO, prs, issues })).toEqual([{ issue: 8, pr: 10 }]);
	});
});

function fakeGh(state: Record<number, string>, reopened: Record<number, string[]> = {}) {
	const calls: string[][] = [];
	const gh: Gh = (args) => {
		calls.push(args);
		if (args[0] === 'pr' && args[1] === 'list') {
			return JSON.stringify([
				pr(20, MERGED, [
					{ number: 1, url: url(1) },
					{ number: 2, url: url(2) },
					{ number: 3, url: url(3, 'other/repo') },
				]),
				pr(21, MERGED, [{ number: 4, url: url(4) }]),
			]);
		}
		if (args[0] === 'issue' && args[1] === 'view') return `${state[Number(args[2])]}\n`;
		if (args[0] === 'api') {
			const n = Number(/issues\/(\d+)\/events/.exec(args[2])?.[1]);
			return (reopened[n] ?? []).map((t) => `${t}\n`).join('');
		}
		if (args[0] === 'issue' && args[1] === 'close') return '';
		throw new Error(`unexpected gh ${args.join(' ')}`);
	};
	return { gh, calls };
}

describe('main (gh wiring, offline)', () => {
	const env = { REPO, DAYS: '3' };
	const now = new Date('2026-11-12T00:00:00Z');

	it('closes eligible issues with the bot comment and skips the rest', () => {
		const { gh, calls } = fakeGh(
			{ 1: 'OPEN', 2: 'OPEN', 4: 'CLOSED' },
			{ 2: ['2026-11-11T00:00:00Z'] },
		);
		const lines: string[] = [];

		const actions = main({ argv: [], env, gh, log: (l) => lines.push(l), now });

		expect(actions).toEqual([{ issue: 1, pr: 20 }]);
		const list = calls.find((c) => c[0] === 'pr');
		expect(list).toContain('number,mergedAt,closingIssuesReferences');
		expect(list).toContain('merged:>=2026-11-09');
		const closes = calls.filter((c) => c[0] === 'issue' && c[1] === 'close');
		expect(closes).toEqual([
			[
				'issue',
				'close',
				'1',
				'-R',
				REPO,
				'--reason',
				'completed',
				'--comment',
				'🤖 close-linked-issues: closed by #20.',
			],
		]);
		// Cross-repo #3 is never looked up here; closed #4 needs no events call.
		expect(calls.some((c) => c[0] === 'issue' && c[1] === 'view' && c[2] === '3')).toBe(false);
		expect(calls.some((c) => c[0] === 'api' && c[2].includes('/issues/4/'))).toBe(false);
		expect(lines).toEqual(['closed #1 (#20)']);
	});

	it('--dry-run lists without closing', () => {
		const { gh, calls } = fakeGh({ 1: 'OPEN', 2: 'OPEN', 4: 'OPEN' });
		const lines: string[] = [];

		const actions = main({ argv: ['--dry-run'], env, gh, log: (l) => lines.push(l), now });

		expect(actions).toEqual([
			{ issue: 1, pr: 20 },
			{ issue: 2, pr: 20 },
			{ issue: 4, pr: 21 },
		]);
		expect(calls.some((c) => c[1] === 'close')).toBe(false);
		expect(lines).toEqual(['would close #1 (#20)', 'would close #2 (#20)', 'would close #4 (#21)']);
	});
});

describe('close-linked-issues workflow wiring', () => {
	const path = resolve(__dirname, '../../.github/workflows/close-linked-issues.yml');
	const yml = existsSync(path) ? readFileSync(path, 'utf8') : '';

	it('runs the script on Node 24 after checkout', () => {
		expect(yml).toMatch(/uses:\s*actions\/checkout@v4/);
		expect(yml).toMatch(/uses:\s*actions\/setup-node@v4\s+with:\s+node-version:\s*24/);
		expect(yml).toMatch(/node\s+scripts\/close-linked-issues\.mts\s+--dry-run/);
		expect(yml).toMatch(/node\s+scripts\/close-linked-issues\.mts\s*\n/);
	});

	it('exposes a boolean dry_run dispatch input and keeps the schedule', () => {
		expect(yml).toMatch(/dry_run:\s+description:[^\n]+\n\s+type:\s*boolean\s+default:\s*false/);
		expect(yml).toMatch(/DRY_RUN:\s*\$\{\{\s*inputs\.dry_run/);
		expect(yml).toContain("cron: '*/30 * * * *'");
		expect(yml).toMatch(/issues:\s*write/);
	});

	it('no longer selects issues inline', () => {
		expect(yml).not.toContain('closingIssuesReferences');
		expect(yml).not.toContain('gh issue close');
	});
});
