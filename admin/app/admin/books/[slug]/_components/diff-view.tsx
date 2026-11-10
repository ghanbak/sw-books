'use client';

import { patchBook } from '@/app/_actions/books';
import { lookupCandidates } from '@/app/_actions/lookup';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { callAction } from '@/lib/call-action';
import { cn } from '@/lib/utils';
import { createSaveGate, serializeSave } from '@app/serial-save';
import {
	ARRAY_FIELDS,
	type DiffField,
	type LookupSelection,
	SCALAR_FIELDS,
	type Source,
	arr,
	buildLookupPatch,
	previewIsbns,
	pruneLookupSelection,
	scalar,
} from '@app/sources/lookup-selection';
import type { LookupResult } from '@app/sources/types';
import type { Database } from '@app/types';
import { Loader2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, startTransition, useState, useTransition } from 'react';
import { toast } from 'sonner';

type BookRow = Database['public']['Tables']['books']['Row'];

const SOURCE_LABELS: Record<Source, string> = {
	current: 'current record',
	ol: 'Open Library',
	gb: 'Google Books',
};

const LABELS: Record<DiffField, string> = {
	cover_image: 'Cover',
	publisher: 'Publisher',
	date_published: 'Published',
	language: 'Language',
	synopsis: 'Synopsis',
	format: 'Format',
	isbn: 'ISBN',
};

export function DiffView({ book }: { book: BookRow }) {
	const router = useRouter();
	const [candidates, setCandidates] = useState<LookupResult | null>(null);
	const [lookupPending, startLookup] = useTransition();
	const [, startApply] = useTransition();
	// Held from Apply until a failed save or until the refreshed row (new
	// `updated_at`) lands, so a second Apply can't resend the stale one (#184).
	const [gate, setGate] = useState(createSaveGate);
	const [applying, setApplying] = useState(false);
	const [gateAt, setGateAt] = useState(book.updated_at);
	if (book.updated_at !== gateAt) {
		setGateAt(book.updated_at);
		setGate(createSaveGate());
		setApplying(false);
	}
	const [selection, setSelection] = useState<LookupSelection>({});
	const [replaceIsbn, setReplaceIsbn] = useState(false);
	const [confirmSlug, setConfirmSlug] = useState('');
	const [enlarged, setEnlarged] = useState<string | null>(null);
	// Done in render, not in the lookup callback, so a radio changed while the
	// lookup was pending is pruned too (#240).
	const [prunedFor, setPrunedFor] = useState(candidates);
	if (candidates && candidates !== prunedFor) {
		setPrunedFor(candidates);
		const pruned = pruneLookupSelection(selection, candidates);
		setSelection(pruned.selection);
		if (pruned.isbnDropped) {
			setReplaceIsbn(false);
			setConfirmSlug('');
		}
	}

	const hasCandidates = candidates !== null;

	function runLookup() {
		startLookup(async () => {
			const res = await callAction(() => lookupCandidates(book.slug));
			if (res.ok) {
				setCandidates(res.data);
				const olEmpty = Object.keys(res.data.ol).length === 0;
				const gbEmpty = Object.keys(res.data.gb).length === 0;
				toast.success(`Lookup done${olEmpty ? ' · OL empty' : ''}${gbEmpty ? ' · GB empty' : ''}`);
			} else {
				toast.error(`Lookup failed: ${res.error.message}`);
			}
		});
	}

	function fillEmpty() {
		setSelection((prev) => {
			const next = { ...prev };
			for (const f of SCALAR_FIELDS) {
				if ((book[f] ?? null) !== null) continue;
				if (scalar(book, candidates, f, 'ol')) next[f] = 'ol';
				else if (scalar(book, candidates, f, 'gb')) next[f] = 'gb';
			}
			for (const f of ARRAY_FIELDS) {
				if ((book[f] ?? []).length > 0) continue;
				if (arr(book, candidates, f, 'ol').length) next[f] = 'ol';
				else if (arr(book, candidates, f, 'gb').length) next[f] = 'gb';
			}
			return next;
		});
	}

	// Resulting ISBN list + primary preview given the current selection.
	const isbnSource = selection.isbn ?? 'current';
	const { isbns: resultingIsbns, primary: primaryPreview } = previewIsbns(
		book,
		candidates,
		isbnSource,
		replaceIsbn,
	);

	const patch = buildLookupPatch(book, candidates, selection, replaceIsbn);
	const changeCount = Object.keys(patch).length;
	const replaceBlocked = isbnSource !== 'current' && replaceIsbn && confirmSlug !== book.slug;

	function apply() {
		if (gate.held) return;
		if (changeCount === 0) {
			toast.info('Nothing selected to apply');
			return;
		}
		setApplying(true);
		startApply(async () => {
			let res: Awaited<ReturnType<typeof patchBook>> | undefined;
			try {
				res = await serializeSave(
					gate,
					() => patchBook(book.id, book.updated_at, patch),
					(r) => r.ok,
				);
			} catch {
				setApplying(false);
				toast.error('Apply failed: request did not complete');
				return;
			}
			if (!res) return;
			if (!res.ok) setApplying(false);
			if (res.ok) {
				toast.success(`Applied ${changeCount} field(s)`);
				setSelection({});
				setReplaceIsbn(false);
				setConfirmSlug('');
				startTransition(() => router.refresh());
			} else if (res.error.code === 'CONFLICT') {
				toast.error(res.error.message, {
					action: { label: 'Reload', onClick: () => router.refresh() },
				});
			} else {
				toast.error(`Apply failed: ${res.error.message}`);
			}
		});
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center gap-3">
				<div>
					<h1 className="font-semibold text-2xl tracking-tight">{book.title}</h1>
					<p className="text-muted-foreground text-sm">
						<span className="font-mono">{book.slug}</span> · {book.author?.join('; ')}
					</p>
				</div>
				<div className="ml-auto flex items-center gap-2">
					<Button onClick={runLookup} disabled={lookupPending} variant="secondary">
						{lookupPending ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<Sparkles className="size-4" />
						)}
						{hasCandidates ? 'Re-run lookup' : 'Run lookup'}
					</Button>
				</div>
			</div>

			{hasCandidates && (
				<div className="flex items-center gap-2 text-muted-foreground text-xs">
					<Button variant="ghost" size="sm" onClick={fillEmpty}>
						Fill all empty
					</Button>
					<span>· candidates fetched {new Date(candidates.fetchedAt).toLocaleTimeString()}</span>
				</div>
			)}

			{/* column header */}
			<div className="grid grid-cols-[120px_1fr_1fr_1fr] gap-3 border-border border-b pb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
				<div>Field</div>
				<div>Current</div>
				<div>Open Library</div>
				<div>Google Books</div>
			</div>

			{SCALAR_FIELDS.map((field) => (
				<FieldRow
					key={field}
					label={LABELS[field]}
					selected={selection[field] ?? 'current'}
					onSelect={(s) => setSelection((p) => ({ ...p, [field]: s }))}
					render={(source) => {
						const v = scalar(book, candidates, field, source);
						if (field === 'cover_image') {
							return v ? (
								// Sits inside the row's <label>: preventDefault keeps the click from
								// toggling the radio, stopPropagation keeps it out of the row.
								<button
									type="button"
									aria-label="Enlarge cover"
									className="cursor-zoom-in rounded outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										setEnlarged(v);
									}}
								>
									<img
										src={v}
										alt={`Cover from ${SOURCE_LABELS[source]}`}
										className="h-24 w-16 rounded border border-border object-cover"
									/>
								</button>
							) : (
								<span className="text-muted-foreground text-xs">—</span>
							);
						}
						return (
							<span className={cn('text-sm', field === 'synopsis' && 'line-clamp-4 text-xs')}>
								{v ?? <span className="text-muted-foreground">—</span>}
							</span>
						);
					}}
					hasValue={(source) => Boolean(scalar(book, candidates, field, source))}
					disabledSources={hasCandidates ? [] : ['ol', 'gb']}
				/>
			))}

			<FieldRow
				label={LABELS.format}
				selected={selection.format ?? 'current'}
				onSelect={(s) => setSelection((p) => ({ ...p, format: s }))}
				render={(source) => {
					const v = arr(book, candidates, 'format', source);
					return v.length ? (
						<span className="text-sm">{v.join(', ')}</span>
					) : (
						<span className="text-muted-foreground text-xs">—</span>
					);
				}}
				hasValue={(source) => arr(book, candidates, 'format', source).length > 0}
				disabledSources={hasCandidates ? [] : ['ol', 'gb']}
			/>

			<FieldRow
				label={LABELS.isbn}
				selected={isbnSource}
				onSelect={(s) => setSelection((p) => ({ ...p, isbn: s }))}
				render={(source) => {
					const v = arr(book, candidates, 'isbn', source);
					return v.length ? (
						<div className="flex flex-wrap gap-1">
							{v.map((i) => (
								<Badge key={i} variant="outline" className="font-mono text-[10px]">
									{i}
								</Badge>
							))}
						</div>
					) : (
						<span className="text-muted-foreground text-xs">—</span>
					);
				}}
				hasValue={(source) => arr(book, candidates, 'isbn', source).length > 0}
				disabledSources={hasCandidates ? [] : ['ol', 'gb']}
			/>

			{isbnSource !== 'current' && (
				<div className="space-y-2 rounded-lg border border-border bg-card p-3">
					<div className="flex items-center gap-2">
						<Checkbox
							id="replace"
							checked={replaceIsbn}
							onCheckedChange={(v) => setReplaceIsbn(!!v)}
						/>
						<Label htmlFor="replace" className="text-sm">
							Replace (destructive) — discard current ISBNs instead of merging
						</Label>
					</div>
					{replaceIsbn && (
						<Input
							aria-label="Confirm slug to replace ISBNs"
							value={confirmSlug}
							onChange={(e) => setConfirmSlug(e.target.value)}
							placeholder={`type "${book.slug}" to confirm replace`}
							className="max-w-sm"
						/>
					)}
					<p className="text-muted-foreground text-xs">
						Resulting ISBNs ({resultingIsbns.length}):{' '}
						<span className="font-mono">{resultingIsbns.join(', ') || '—'}</span>
						<br />
						primary_isbn →{' '}
						<span className="font-mono text-saber-blue">{primaryPreview ?? '—'}</span>
					</p>
				</div>
			)}

			<Separator />

			<div className="flex items-center gap-3">
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button disabled={changeCount === 0 || replaceBlocked || applying}>
							{applying && <Loader2 className="size-4 animate-spin" />}
							Apply {changeCount > 0 ? `${changeCount} field(s)` : 'selected'}
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								Apply {changeCount} change(s) to “{book.title}”?
							</AlertDialogTitle>
							<AlertDialogDescription>
								Writes directly to the local database. Review <code>/diff</code> before exporting to
								CSV.
								{replaceIsbn && ' ISBNs will be REPLACED, not merged.'}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={apply}>Apply</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
				{changeCount > 0 && (
					<span className="text-muted-foreground text-sm">{Object.keys(patch).join(', ')}</span>
				)}
				{replaceBlocked && (
					<span className="text-destructive-text text-sm">type the slug to confirm replace</span>
				)}
			</div>

			<Dialog open={enlarged !== null} onOpenChange={(o) => !o && setEnlarged(null)}>
				<DialogContent className="max-w-md">
					<DialogTitle className="sr-only">Cover preview</DialogTitle>
					{enlarged && <img src={enlarged} alt="" className="mx-auto max-h-[70vh] rounded" />}
				</DialogContent>
			</Dialog>
		</div>
	);
}

function FieldRow({
	label,
	selected,
	onSelect,
	render,
	hasValue,
	disabledSources,
}: {
	label: string;
	selected: Source;
	onSelect: (s: Source) => void;
	render: (source: Source) => ReactNode;
	hasValue: (source: Source) => boolean;
	disabledSources: Source[];
}) {
	return (
		<div className="grid grid-cols-[120px_1fr_1fr_1fr] items-start gap-3 border-border/60 border-b py-3">
			<div className="pt-1 font-medium text-sm">{label}</div>
			<RadioGroup
				aria-label={label}
				className="contents"
				value={selected}
				onValueChange={(v) => onSelect(v as Source)}
			>
				{(['current', 'ol', 'gb'] as const).map((source) => {
					const disabled =
						disabledSources.includes(source) || (source !== 'current' && !hasValue(source));
					return (
						<label
							key={source}
							className={cn(
								'flex items-start gap-2 rounded-md border p-2 transition-colors',
								selected === source ? 'border-saber-blue bg-accent/40' : 'border-transparent',
								disabled ? 'opacity-40' : 'cursor-pointer hover:bg-secondary/40',
							)}
						>
							<RadioGroupItem value={source} disabled={disabled} className="mt-0.5" />
							<div className="min-w-0 flex-1">{render(source)}</div>
						</label>
					);
				})}
			</RadioGroup>
		</div>
	);
}
