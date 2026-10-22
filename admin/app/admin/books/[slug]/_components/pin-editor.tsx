'use client';

import {
	type PinCandidate,
	removePin,
	savePin,
	searchPinCandidates,
} from '@/app/_actions/enrichment';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { EnrichmentPin } from '@app/wookieepedia/pins';
import { Check, ExternalLink, Loader2, Pin, PinOff, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

/** Why a candidate can't be pinned (mirrors the server-side refusals), or null. */
function refusal(c: PinCandidate): string | null {
	if (c.status === 'missing') return 'Page not found';
	if (c.status === 'redirect') return `Redirect → ${c.redirectTarget ?? '?'}`;
	if (!c.hasBookInfobox && !c.hasApp) return 'No {{Book}} and no {{App}}';
	if (c.claimedBy) return `Owned by ${c.claimedBy}`;
	return null;
}

function Fact({ ok, children }: { ok: boolean; children: React.ReactNode }) {
	return (
		<Badge
			variant="outline"
			className={cn('gap-1 font-normal', ok ? 'text-foreground' : 'text-muted-foreground')}
		>
			{ok ? <Check className="text-saber-blue" aria-hidden /> : <X aria-hidden />}
			{children}
			<span className="sr-only">{ok ? ' yes' : ' no'}</span>
		</Badge>
	);
}

/**
 * Pin a Wookieepedia page to this book in data/enrichment-pins.json. Never
 * writes book_enrichment — the next `npm run catalog:enrich` picks the pin up.
 */
export function PinEditor({
	slug,
	defaultQuery,
	pin,
	storedPageid,
	writable,
	pinErrors,
}: {
	slug: string;
	defaultQuery: string;
	pin: EnrichmentPin | null;
	storedPageid: number | null;
	writable: boolean;
	pinErrors: string[];
}) {
	const router = useRouter();
	const [query, setQuery] = useState(defaultQuery);
	const [note, setNote] = useState('');
	const [results, setResults] = useState<PinCandidate[] | null>(null);
	const [searching, startSearch] = useTransition();
	const [saving, startSave] = useTransition();
	const [savingId, setSavingId] = useState<number | null>(null);
	// On an enriched book a pin only requests a re-point, so keep search tucked away.
	const [searchOpen, setSearchOpen] = useState(storedPageid === null);

	function search(e: React.FormEvent) {
		e.preventDefault();
		startSearch(async () => {
			const res = await searchPinCandidates(slug, query);
			if (res.ok) setResults(res.data);
			else toast.error(res.error.message);
		});
	}

	function save(c: PinCandidate) {
		setSavingId(c.pageid);
		startSave(async () => {
			const res = await savePin({ slug, pageid: c.pageid, note: note.trim() || undefined });
			setSavingId(null);
			if (!res.ok) {
				toast.error(res.error.message);
				return;
			}
			toast.success(`Pinned “${res.data.pin.title}” (${res.data.pin.pageid})`);
			if (res.data.warning) toast.warning(res.data.warning);
			setResults(null);
			setNote('');
			router.refresh();
		});
	}

	function remove() {
		startSave(async () => {
			const res = await removePin(slug);
			if (!res.ok) {
				toast.error(res.error.message);
				return;
			}
			toast.success('Pin removed');
			router.refresh();
		});
	}

	const conflict = pin && storedPageid !== null && pin.pageid !== storedPageid;

	return (
		<div className="space-y-3 border-border border-t pt-4">
			<div className="flex items-center gap-2">
				<h3 className="font-medium text-sm">Manual page pin</h3>
				<span className="text-muted-foreground text-xs">data/enrichment-pins.json</span>
			</div>

			{pinErrors.length > 0 && (
				<p className="text-destructive text-sm">
					Pin file is invalid ({pinErrors[0]}). Fix it before editing pins.
				</p>
			)}

			{pin ? (
				<div className="flex flex-wrap items-start gap-3 rounded-md border border-border p-3 text-sm">
					<Pin className="mt-0.5 size-4 text-saber-yellow" aria-hidden />
					<div className="min-w-0 flex-1 space-y-0.5">
						<p>
							<span className="font-medium">{pin.title}</span>{' '}
							<span className="font-mono text-muted-foreground">#{pin.pageid}</span>
						</p>
						{pin.note && <p className="text-muted-foreground">{pin.note}</p>}
						<p className="text-muted-foreground text-xs">
							Pinned {new Date(pin.pinned_at).toISOString().slice(0, 10)}
							{storedPageid === pin.pageid ? ' · matches the stored row' : null}
						</p>
						{conflict && (
							<p className="text-destructive text-xs">
								Differs from the stored row (#{storedPageid}). The sync keeps the stored page and
								reports a conflict unless run with --repin.
							</p>
						)}
					</div>
					{writable && (
						<Button
							variant="ghost"
							size="sm"
							onClick={remove}
							disabled={saving || pinErrors.length > 0}
							className="text-muted-foreground hover:text-destructive"
						>
							<PinOff className="size-4" /> Remove pin
						</Button>
					)}
				</div>
			) : (
				<p className="text-muted-foreground text-sm">
					No pin.{' '}
					{storedPageid === null
						? 'Pin a page to enrich this book on the next sync.'
						: 'The stored row is the mapping; pin only to request a re-point (--repin).'}
				</p>
			)}

			{!writable ? (
				<p className="text-muted-foreground text-xs">
					Pins are edited in the local admin (`npm run admin`) and shipped via git — data/ is not
					writable here.
				</p>
			) : !searchOpen ? (
				<Button variant="secondary" size="sm" onClick={() => setSearchOpen(true)}>
					<Search className="size-4" /> Pin a different page…
				</Button>
			) : (
				<>
					<form onSubmit={search} className="flex flex-wrap items-end gap-2">
						<div className="min-w-[280px] flex-1 space-y-1">
							<Label htmlFor="pin-query" className="text-xs">
								Search Wookieepedia (title, pageid, or wiki URL)
							</Label>
							<Input
								id="pin-query"
								autoFocus={storedPageid !== null}
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								autoComplete="off"
							/>
						</div>
						<div className="w-[260px] space-y-1">
							<Label htmlFor="pin-note" className="text-xs">
								Note (optional)
							</Label>
							<Input
								id="pin-note"
								value={note}
								maxLength={300}
								onChange={(e) => setNote(e.target.value)}
								placeholder="Why this page"
							/>
						</div>
						<Button
							type="submit"
							variant="secondary"
							disabled={searching || query.trim().length < 2}
						>
							{searching ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Search className="size-4" />
							)}
							Search
						</Button>
					</form>

					<div aria-live="polite">
						{results !== null &&
							(results.length === 0 ? (
								<p className="text-muted-foreground text-sm">No pages found.</p>
							) : (
								<ul className="divide-y divide-border rounded-md border border-border">
									{results.map((c) => {
										const blocked = refusal(c);
										const current = pin?.pageid === c.pageid;
										return (
											<li key={c.pageid} className="flex flex-wrap items-center gap-3 p-3">
												<div className="min-w-0 flex-1 space-y-1.5">
													<p className="text-sm">
														<a
															href={c.url}
															target="_blank"
															rel="noopener noreferrer"
															className="inline-flex items-center gap-1 font-medium hover:text-saber-blue hover:underline"
														>
															{c.title}
															<ExternalLink className="size-3.5" aria-hidden />
															<span className="sr-only">(opens Wookieepedia in a new tab)</span>
														</a>{' '}
														<span className="font-mono text-muted-foreground text-xs">
															#{c.pageid}
														</span>
													</p>
													<div className="flex flex-wrap gap-1">
														<Fact ok={c.status !== 'redirect'}>
															{c.status === 'redirect'
																? `Redirect → ${c.redirectTarget ?? '?'}`
																: 'Not a redirect'}
														</Fact>
														<Fact ok={c.hasBookInfobox}>{'{{Book}}'} infobox</Fact>
														<Fact ok={c.hasApp}>
															{'{{App}}'}
															{c.hasApp ? ` · ${c.entryCount} entries` : ''}
														</Fact>
														<Fact ok={c.timeline !== null}>
															Timeline{c.timeline ? `: ${c.timeline}` : ''}
														</Fact>
													</div>
												</div>
												{current ? (
													<Badge variant="outline" className="text-saber-yellow">
														Current pin
													</Badge>
												) : (
													<Button
														size="sm"
														onClick={() => save(c)}
														disabled={blocked !== null || saving || pinErrors.length > 0}
														title={blocked ?? undefined}
														aria-label={
															blocked
																? `Can't pin ${c.title}: ${blocked}`
																: `Pin ${c.title} to this book`
														}
													>
														{saving && savingId === c.pageid ? (
															<Loader2 className="size-4 animate-spin" />
														) : (
															<Pin className="size-4" />
														)}
														{blocked ?? 'Pin'}
													</Button>
												)}
											</li>
										);
									})}
								</ul>
							))}
					</div>
					<p className="text-muted-foreground text-xs">
						Pins never write book_enrichment. Commit the file, then{' '}
						<code className="font-mono">npm run catalog:enrich -- --production</code> (dry-run) →{' '}
						<code className="font-mono">--apply</code>.
					</p>
				</>
			)}
		</div>
	);
}
