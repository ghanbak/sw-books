import { EnrichmentStatusBadge } from '@/components/enrichment-status-badge';
import { Badge } from '@/components/ui/badge';
import { PINS_WRITABLE, deriveStates, getWikiInfo, loadEnrichmentContext } from '@/lib/enrichment';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { APPEARANCE_CATEGORIES, APPEARANCE_CATEGORY_LABELS } from '@app/wookieepedia/enrichment';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { PinEditor } from './pin-editor';

function categoryCounts(appearances: unknown): { key: string; label: string; n: number }[] {
	if (appearances === null || typeof appearances !== 'object' || Array.isArray(appearances))
		return [];
	const a = appearances as Record<string, unknown>;
	return APPEARANCE_CATEGORIES.map((key) => ({
		key,
		label: APPEARANCE_CATEGORY_LABELS[key],
		n: Array.isArray(a[key]) ? (a[key] as unknown[]).length : 0,
	})).filter((c) => c.n > 0);
}

const fmtDate = (iso: string) =>
	`${new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<>
			<dt className="text-muted-foreground text-sm">{label}</dt>
			<dd className="min-w-0 text-sm">{children}</dd>
		</>
	);
}

const none = <span className="text-muted-foreground">—</span>;

/**
 * Wookieepedia enrichment state for one book: the stored `book_enrichment` row
 * (read-only, selected DB target), the mapping status the sync would see, and
 * the pin editor. Streams in behind a Suspense boundary (it checks the wiki).
 */
export async function EnrichmentCard({
	bookId,
	slug,
	title,
}: {
	bookId: string;
	slug: string;
	title: string;
}) {
	const supabase = await getSupabaseAdmin();
	const [ctx, rowRes] = await Promise.all([
		loadEnrichmentContext(supabase),
		supabase
			.from('book_enrichment')
			.select(
				'source_pageid, source_title, source_url, source_revision_id, fetched_at, timeline_notes, appearances',
			)
			.eq('book_id', bookId)
			.maybeSingle(),
	]);
	if (!ctx.ok || rowRes.error) {
		return (
			<EnrichmentShell>
				<p className="text-destructive text-sm">
					Couldn’t read enrichment: {ctx.ok ? rowRes.error?.message : ctx.message}
				</p>
			</EnrichmentShell>
		);
	}
	const row = rowRes.data;
	const pin = ctx.data.pins.pins.get(slug) ?? null;
	const ids = [row?.source_pageid, pin?.pageid].filter((x): x is number => x != null);
	const wiki = await getWikiInfo(ids);
	const state = deriveStates(ctx.data, wiki).get(slug);
	const live = row ? wiki?.get(row.source_pageid) : undefined;
	const counts = categoryCounts(row?.appearances);
	const total = counts.reduce((n, c) => n + c.n, 0);
	const mainCast = counts.find((c) => c.key === 'dramatis_personae')?.n ?? 0;
	const characters = counts.find((c) => c.key === 'characters')?.n ?? 0;

	return (
		<EnrichmentShell
			status={
				state ? (
					<EnrichmentStatusBadge status={state.status} reason={state.reasons.join(' · ')} />
				) : null
			}
		>
			{state && state.reasons.length > 0 && (
				<ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
					{state.reasons.map((r) => (
						<li key={r}>{r}</li>
					))}
				</ul>
			)}
			{wiki === null && (
				<p className="text-muted-foreground text-xs">
					Wiki health check unavailable (wiki unreachable): missing/redirect not checked.
				</p>
			)}

			<dl className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-2">
				<Field label="Mapped page">
					{row ? (
						<a
							href={row.source_url}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-saber-blue hover:underline"
						>
							{row.source_title ?? row.source_url}
							<ExternalLink className="size-3.5" aria-hidden />
							<span className="sr-only">(opens Wookieepedia in a new tab)</span>
						</a>
					) : (
						<span className="text-muted-foreground">No row in book_enrichment</span>
					)}
					{live?.status === 'ok' && row && live.title !== row.source_title && (
						<span className="ml-2 text-muted-foreground text-xs">now “{live.title}”</span>
					)}
				</Field>
				<Field label="source_pageid">
					<span className="font-mono">{row?.source_pageid ?? none}</span>
				</Field>
				<Field label="source_revision_id">
					<span className="font-mono">{row?.source_revision_id ?? none}</span>
					{live?.status === 'ok' &&
						row?.source_revision_id != null &&
						live.lastrevid !== row.source_revision_id && (
							<span className="ml-2 text-muted-foreground text-xs">
								wiki is at {live.lastrevid} (re-syncs only if stored facts changed)
							</span>
						)}
				</Field>
				<Field label="fetched_at">{row ? fmtDate(row.fetched_at) : none}</Field>
				<Field label="Appearances">
					{row ? (
						<div className="space-y-1.5">
							<p className="tabular-nums">
								{mainCast} main cast · {characters} characters · {total} entries total
							</p>
							{counts.length > 0 && (
								<div className="flex flex-wrap gap-1">
									{counts.map((c) => (
										<Badge key={c.key} variant="outline" className="font-normal tabular-nums">
											{c.label} {c.n}
										</Badge>
									))}
								</div>
							)}
							{total === 0 && (
								<p className="text-muted-foreground text-xs">
									Page has no {'{{App}}'} — row carries the backlink and timeline only.
								</p>
							)}
						</div>
					) : (
						none
					)}
				</Field>
				<Field label="timeline_notes">
					{row?.timeline_notes ? (
						<span>{row.timeline_notes}</span>
					) : (
						<span className="text-muted-foreground">{row ? 'Not present' : '—'}</span>
					)}
				</Field>
			</dl>

			<PinEditor
				slug={slug}
				defaultQuery={title}
				pin={pin}
				storedPageid={row?.source_pageid ?? null}
				writable={PINS_WRITABLE && ctx.data.pins.available}
				pinErrors={ctx.data.pins.errors}
			/>
		</EnrichmentShell>
	);
}

export function EnrichmentShell({
	status,
	children,
}: {
	status?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section
			id="enrichment"
			aria-labelledby="enrichment-heading"
			className="scroll-mt-6 space-y-4 rounded-lg border border-border bg-card p-4"
		>
			<div className="flex items-center gap-3">
				<h2 id="enrichment-heading" className="font-semibold text-lg tracking-tight">
					Wookieepedia enrichment
				</h2>
				{status}
			</div>
			{children}
		</section>
	);
}
