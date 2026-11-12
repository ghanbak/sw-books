// Closes issues linked (`Closes #n`) from PRs merged into main. Auto-merge merges as
// github-actions, and GitHub skips closing keywords on GITHUB_TOKEN merges (#137), so
// .github/workflows/close-linked-issues.yml runs this on a schedule instead.
//
// Run with plain Node 24 (native type stripping, no deps):
//   node scripts/close-linked-issues.mts [--dry-run] [--days N] [--repo owner/name]
// REPO and DAYS env vars are the defaults for --repo and --days.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ClosingRef = { number: number; url: string };
export type MergedPr = { number: number; mergedAt: string; closingIssuesReferences: ClosingRef[] };
export type IssueEvent = { event: string; created_at: string };
export type IssueInfo = { state: string; events: IssueEvent[] };
export type CloseAction = { issue: number; pr: number };

/** Closing refs that point at an issue in `repo` itself (cross-repo refs are dropped). */
export function linkedRefs(
	repo: string,
	prs: MergedPr[],
): { pr: number; mergedAt: string; issue: number }[] {
	// Owner/name are case-insensitive on GitHub.
	const prefix = `https://github.com/${repo}/issues/`.toLowerCase();
	return prs.flatMap((pr) =>
		(pr.closingIssuesReferences ?? [])
			.filter((ref) => ref.url?.toLowerCase().startsWith(prefix))
			.map((ref) => ({ pr: pr.number, mergedAt: pr.mergedAt, issue: ref.number })),
	);
}

/**
 * Issues to close: OPEN, referenced by a merged PR in `repo`, and not reopened after that PR
 * merged (a reopen after the merge means the owner wants it open). A reopen before the merge
 * still closes. One action per issue, credited to the latest qualifying merge.
 */
export function selectIssuesToClose({
	repo,
	prs,
	issues,
}: {
	repo: string;
	prs: MergedPr[];
	issues: Record<number, IssueInfo | undefined>;
}): CloseAction[] {
	const best = new Map<number, { pr: number; mergedMs: number }>();
	for (const ref of linkedRefs(repo, prs)) {
		const info = issues[ref.issue];
		if (info?.state !== 'OPEN') continue;
		const mergedMs = Date.parse(ref.mergedAt);
		if (Number.isNaN(mergedMs)) continue;
		const reopenedLater = info.events.some(
			(e) => e.event === 'reopened' && Date.parse(e.created_at) > mergedMs,
		);
		if (reopenedLater) continue;
		const prev = best.get(ref.issue);
		if (!prev || mergedMs > prev.mergedMs) best.set(ref.issue, { pr: ref.pr, mergedMs });
	}
	return [...best].map(([issue, { pr }]) => ({ issue, pr })).sort((a, b) => a.issue - b.issue);
}

export type Gh = (args: string[]) => string;

const realGh: Gh = (args) => execFileSync('gh', args, { encoding: 'utf8' });

export function sinceDate(days: number, now = new Date()): string {
	return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

export function main({
	argv = process.argv.slice(2),
	env = process.env,
	gh = realGh,
	log = console.log,
	now = new Date(),
}: {
	argv?: string[];
	env?: Record<string, string | undefined>;
	gh?: Gh;
	log?: (line: string) => void;
	now?: Date;
} = {}): CloseAction[] {
	const flag = (name: string) => {
		const i = argv.indexOf(name);
		return i >= 0 ? argv[i + 1] : undefined;
	};
	const dryRun = argv.includes('--dry-run');
	const repo = flag('--repo') ?? env.REPO;
	const days = Number(flag('--days') ?? env.DAYS ?? '3');
	if (!repo) throw new Error('close-linked-issues: set --repo or REPO');
	if (!Number.isFinite(days) || days < 0)
		throw new Error(`close-linked-issues: bad --days ${days}`);

	const prs: MergedPr[] = JSON.parse(
		gh([
			'pr',
			'list',
			'-R',
			repo,
			'--state',
			'merged',
			'--base',
			'main',
			'--search',
			`merged:>=${sinceDate(days, now)}`,
			'--limit',
			'500',
			'--json',
			'number,mergedAt,closingIssuesReferences',
		]),
	);

	const issues: Record<number, IssueInfo> = {};
	for (const { issue } of linkedRefs(repo, prs)) {
		if (issues[issue]) continue;
		const state = gh([
			'issue',
			'view',
			String(issue),
			'-R',
			repo,
			'--json',
			'state',
			'-q',
			'.state',
		]).trim();
		// Events only matter for OPEN issues; skip the API call otherwise.
		const events: IssueEvent[] =
			state === 'OPEN'
				? gh([
						'api',
						'--paginate',
						`repos/${repo}/issues/${issue}/events`,
						'--jq',
						'.[] | select(.event == "reopened") | .created_at',
					])
						.split('\n')
						.filter(Boolean)
						.map((created_at) => ({ event: 'reopened', created_at }))
				: [];
		issues[issue] = { state, events };
	}

	const actions = selectIssuesToClose({ repo, prs, issues });
	for (const { issue, pr } of actions) {
		if (dryRun) {
			log(`would close #${issue} (#${pr})`);
			continue;
		}
		gh([
			'issue',
			'close',
			String(issue),
			'-R',
			repo,
			'--reason',
			'completed',
			'--comment',
			`🤖 close-linked-issues: closed by #${pr}.`,
		]);
		log(`closed #${issue} (#${pr})`);
	}
	if (actions.length === 0) log('nothing to close');
	return actions;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
