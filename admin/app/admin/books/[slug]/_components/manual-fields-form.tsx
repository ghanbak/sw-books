'use client';

import { patchBook } from '@/app/_actions/books';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	CANON_VALUES,
	type ManualBook,
	type ManualDraft,
	type ManualField,
	TYPE_VALUES,
	draftFromBook,
	issuesByField,
	manualEditPatch,
	patchSchema,
} from '@app/book-schema';
import { createSaveGate, serializeSave } from '@app/serial-save';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, startTransition, useState, useTransition } from 'react';
import { toast } from 'sonner';

const LABELS: Record<ManualField, string> = {
	title: 'Title',
	author: 'Author (; or , separated)',
	cover_image: 'Cover image URL',
	synopsis: 'Synopsis',
	publisher: 'Publisher',
	date_published: 'Published (YYYY-MM-DD)',
	era: 'Era',
	series_name: 'Series name',
	series_order: 'Series #',
	timeline_order: 'Timeline order',
	canon: 'Canon',
	type: 'Type',
};

type Errors = Partial<Record<string, string>>;

/**
 * Hand-edit catalog fields on the book page. Saves only changed fields through
 * `patchBook` with the `updated_at` the page loaded, so a write made elsewhere
 * since (another tab, a diff apply, a bulk op) comes back as CONFLICT. The
 * parent keys this on `updated_at`, so a refresh after any save resets drafts.
 * Saves are serialized: after a success the form stays locked until that
 * refresh remounts it, so a second click can't resend the stale `updated_at`.
 */
export function ManualFieldsForm({
	bookId,
	updatedAt,
	book,
}: {
	bookId: string;
	updatedAt: string | null;
	book: ManualBook;
}) {
	const router = useRouter();
	const [draft, setDraft] = useState<ManualDraft>(() => draftFromBook(book));
	const [errors, setErrors] = useState<Errors>({});
	const [, startSave] = useTransition();
	// Per-mount gate; the remount on the new `updated_at` is what frees it.
	const [gate] = useState(createSaveGate);
	// Mirrors the gate for rendering: true from submit until a failed save or
	// the post-success remount.
	const [saving, setSaving] = useState(false);

	const patch = manualEditPatch(book, draft);
	const changed = Object.keys(patch);

	function set(field: ManualField, value: string) {
		setDraft((d) => ({ ...d, [field]: value }));
		setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
	}

	function save(e: React.FormEvent) {
		e.preventDefault();
		if (gate.held || changed.length === 0) return;
		const parsed = patchSchema.safeParse(patch);
		if (!parsed.success) {
			setErrors(issuesByField(parsed.error));
			return;
		}
		setErrors({});
		setSaving(true);
		startSave(async () => {
			let res: Awaited<ReturnType<typeof patchBook>> | undefined;
			try {
				res = await serializeSave(
					gate,
					() => patchBook(bookId, updatedAt, patch),
					(r) => r.ok,
				);
			} catch {
				setSaving(false);
				toast.error('Save failed: request did not complete');
				return;
			}
			if (!res) return;
			if (!res.ok) setSaving(false);
			if (res.ok) {
				toast.success(`Saved ${changed.length} field(s)`);
				startTransition(() => router.refresh());
			} else if (res.error.code === 'CONFLICT') {
				toast.error(res.error.message, {
					action: { label: 'Reload', onClick: () => router.refresh() },
				});
			} else {
				toast.error(`Save failed: ${res.error.message}`);
			}
		});
	}

	const fieldProps = (field: ManualField) => ({
		id: `manual-${field}`,
		value: draft[field],
		disabled: saving,
		'aria-invalid': errors[field] ? true : undefined,
		'aria-describedby': errors[field] ? `manual-${field}-error` : undefined,
	});

	const text = (field: ManualField, extra?: React.ComponentProps<typeof Input>) => (
		<Field field={field} error={errors[field]} dirty={field in patch}>
			<Input {...fieldProps(field)} {...extra} onChange={(e) => set(field, e.target.value)} />
		</Field>
	);

	const enumSelect = (field: 'canon' | 'type', options: readonly string[]) => (
		<Field field={field} error={errors[field]} dirty={field in patch}>
			<Select value={draft[field]} onValueChange={(v) => set(field, v)} disabled={saving}>
				<SelectTrigger
					id={`manual-${field}`}
					className="w-full"
					aria-invalid={errors[field] ? true : undefined}
					aria-describedby={errors[field] ? `manual-${field}-error` : undefined}
				>
					<SelectValue placeholder="—" />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{options.map((o) => (
							<SelectItem key={o} value={o}>
								{o}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
		</Field>
	);

	const coverValid = patchSchema.safeParse({ cover_image: draft.cover_image.trim() || null });
	const coverPreview = coverValid.success ? draft.cover_image.trim() : null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Edit fields</CardTitle>
				<CardDescription>
					Hand-sourced values. Saves only changed fields to the selected database.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={save} noValidate className="flex flex-col gap-6">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						{text('title')}
						{text('author')}
						<div className="grid grid-cols-2 gap-3">
							{enumSelect('canon', CANON_VALUES)}
							{enumSelect('type', TYPE_VALUES)}
						</div>
						{text('era')}
						{text('series_name')}
						<div className="grid grid-cols-2 gap-3">
							{text('series_order', { inputMode: 'numeric' })}
							{text('timeline_order', { inputMode: 'decimal' })}
						</div>
						{text('publisher')}
						{text('date_published', { placeholder: 'YYYY-MM-DD' })}
					</div>

					<div className="flex gap-4">
						<div className="min-w-0 flex-1">
							{text('cover_image', {
								type: 'url',
								placeholder: 'https://…',
								className: 'font-mono text-xs',
							})}
						</div>
						<div className="flex h-24 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted">
							{coverPreview ? (
								<img src={coverPreview} alt="Cover preview" className="size-full object-cover" />
							) : (
								<span className="text-muted-foreground text-xs">—</span>
							)}
						</div>
					</div>

					<Field field="synopsis" error={errors.synopsis} dirty={'synopsis' in patch}>
						<textarea
							{...fieldProps('synopsis')}
							rows={6}
							onChange={(e) => set('synopsis', e.target.value)}
							className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
						/>
					</Field>

					<div className="flex flex-wrap items-center gap-3">
						<Button type="submit" disabled={saving || changed.length === 0}>
							{saving && <Loader2 className="size-4 animate-spin" />}
							Save {changed.length > 0 ? `${changed.length} field(s)` : 'changes'}
						</Button>
						<Button
							type="button"
							variant="ghost"
							disabled={saving || changed.length === 0}
							onClick={() => {
								setDraft(draftFromBook(book));
								setErrors({});
							}}
						>
							Discard
						</Button>
						{changed.length > 0 && (
							<span className="text-muted-foreground text-sm">{changed.join(', ')}</span>
						)}
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

function Field({
	field,
	error,
	dirty,
	children,
}: {
	field: ManualField;
	error: string | undefined;
	dirty: boolean;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={`manual-${field}`} className="text-muted-foreground text-xs">
				{LABELS[field]}
				{dirty && (
					<span className="text-saber-blue">
						<span aria-hidden="true"> •</span>
						<span className="sr-only">(changed)</span>
					</span>
				)}
			</Label>
			{children}
			{error && (
				<p id={`manual-${field}-error`} className="text-destructive text-xs">
					{error}
				</p>
			)}
		</div>
	);
}
