'use client';

import { createBook } from '@/app/_actions/books';
import { type NewBookSearch, searchForNewBook } from '@/app/_actions/lookup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { slugify } from '@app/slug';
import type { BookCandidate, LookupResult } from '@app/sources/types';
import { Loader2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

const CANON = ['Canon', 'Legends'] as const;
const TYPE = ['Adult Novel', 'YA Novel', 'Middle Grade Novel'] as const;

type FormState = {
	title: string;
	slug: string;
	slugTouched: boolean;
	author: string; // comma-separated
	canon: (typeof CANON)[number];
	type: (typeof TYPE)[number];
	era: string;
	series_name: string;
	series_order: string;
	timeline_order: string;
	publisher: string;
	date_published: string;
	language: string;
	isbn: string; // semicolon-separated
	primary_isbn: string;
	format: string; // semicolon-separated
	cover_image: string;
	synopsis: string;
};

const EMPTY: FormState = {
	title: '',
	slug: '',
	slugTouched: false,
	author: '',
	canon: 'Canon',
	type: 'Adult Novel',
	era: '',
	series_name: '',
	series_order: '',
	timeline_order: '',
	publisher: '',
	date_published: '',
	language: '',
	isbn: '',
	primary_isbn: '',
	format: '',
	cover_image: '',
	synopsis: '',
};

function splitList(value: string): string[] {
	return value
		.split(/[;,]/)
		.map((s) => s.trim())
		.filter(Boolean);
}

function orNull(value: string): string | null {
	const t = value.trim();
	return t.length > 0 ? t : null;
}

function numOrNull(value: string): number | null {
	const t = value.trim();
	if (!t) return null;
	const n = Number(t);
	return Number.isFinite(n) ? n : null;
}

export function NewBookForm() {
	const router = useRouter();
	const [form, setForm] = useState<FormState>(EMPTY);
	const [results, setResults] = useState<LookupResult | null>(null);
	const [searching, startSearch] = useTransition();
	const [saving, startSave] = useTransition();

	function set<K extends keyof FormState>(key: K, value: FormState[K]) {
		setForm((f) => ({ ...f, [key]: value }));
	}

	const effectiveSlug = useMemo(
		() => (form.slugTouched ? form.slug : slugify(form.title)),
		[form.slug, form.slugTouched, form.title],
	);

	function runSearch() {
		const query: NewBookSearch = {
			isbn: form.isbn.split(/[;,]/)[0]?.trim() || undefined,
			title: form.title.trim() || undefined,
			author: form.author.split(',')[0]?.trim() || undefined,
		};
		startSearch(async () => {
			const res = await searchForNewBook(query);
			if (!res.ok) {
				toast.error(res.error.message);
				return;
			}
			setResults(res.data);
		});
	}

	function prefill(c: BookCandidate, label: string) {
		setForm((f) => ({
			...f,
			isbn: c.isbn?.length ? c.isbn.join(';') : f.isbn,
			primary_isbn: c.isbn?.[0] ?? f.primary_isbn,
			cover_image: c.cover_image ?? f.cover_image,
			publisher: c.publisher ?? f.publisher,
			date_published: c.date_published ?? f.date_published,
			language: c.language ?? f.language,
			synopsis: c.synopsis ?? f.synopsis,
			format: c.format?.length ? c.format.join(';') : f.format,
		}));
		toast.success(`Prefilled from ${label}`);
	}

	function save() {
		const slug = effectiveSlug;
		if (!form.title.trim()) {
			toast.error('Title is required');
			return;
		}
		if (!slug) {
			toast.error('Slug is required');
			return;
		}
		startSave(async () => {
			const res = await createBook({
				title: form.title.trim(),
				slug,
				author: splitList(form.author),
				canon: form.canon,
				type: form.type,
				era: orNull(form.era),
				series_name: orNull(form.series_name),
				series_order: numOrNull(form.series_order),
				timeline_order: numOrNull(form.timeline_order),
				publisher: orNull(form.publisher),
				date_published: orNull(form.date_published),
				language: orNull(form.language),
				isbn: splitList(form.isbn),
				primary_isbn: orNull(form.primary_isbn),
				format: splitList(form.format),
				cover_image: orNull(form.cover_image),
				synopsis: orNull(form.synopsis),
			});
			if (!res.ok) {
				toast.error(res.error.message);
				if (res.error.code === 'SLUG_TAKEN') {
					const suggested = res.error.message.match(/try "([^"]+)"/)?.[1];
					if (suggested) setForm((f) => ({ ...f, slug: suggested, slugTouched: true }));
				}
				return;
			}
			toast.success(`Created "${res.data.title}"`);
			router.push(`/admin/books/${res.data.slug}`);
		});
	}

	return (
		<div className="space-y-8">
			{/* Search */}
			<section className="rounded-lg border border-border bg-card p-4">
				<h2 className="mb-3 font-medium text-sm">Search Open Library + Google Books</h2>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<Field label="ISBN">
						<Input
							value={form.isbn}
							onChange={(e) => set('isbn', e.target.value)}
							placeholder="978…"
						/>
					</Field>
					<Field label="Title">
						<Input value={form.title} onChange={(e) => set('title', e.target.value)} />
					</Field>
					<Field label="Author">
						<Input value={form.author} onChange={(e) => set('author', e.target.value)} />
					</Field>
				</div>
				<Button className="mt-3" onClick={runSearch} disabled={searching}>
					{searching ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Sparkles className="size-4" />
					)}
					Search
				</Button>

				{results && (
					<div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
						<Candidate
							label="Open Library"
							candidate={results.ol}
							onUse={() => prefill(results.ol, 'Open Library')}
						/>
						<Candidate
							label="Google Books"
							candidate={results.gb}
							onUse={() => prefill(results.gb, 'Google Books')}
						/>
					</div>
				)}
			</section>

			{/* Form */}
			<section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field label="Title *">
					<Input value={form.title} onChange={(e) => set('title', e.target.value)} />
				</Field>
				<Field label="Slug * (editable now, immutable after create)">
					<Input
						value={effectiveSlug}
						onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value, slugTouched: true }))}
					/>
				</Field>
				<Field label="Author (comma-separated)">
					<Input value={form.author} onChange={(e) => set('author', e.target.value)} />
				</Field>
				<div className="grid grid-cols-2 gap-3">
					<Field label="Canon">
						<EnumSelect value={form.canon} options={CANON} onChange={(v) => set('canon', v)} />
					</Field>
					<Field label="Type">
						<EnumSelect value={form.type} options={TYPE} onChange={(v) => set('type', v)} />
					</Field>
				</div>
				<Field label="Series name">
					<Input value={form.series_name} onChange={(e) => set('series_name', e.target.value)} />
				</Field>
				<div className="grid grid-cols-3 gap-3">
					<Field label="Series #">
						<Input
							value={form.series_order}
							onChange={(e) => set('series_order', e.target.value)}
						/>
					</Field>
					<Field label="Timeline">
						<Input
							value={form.timeline_order}
							onChange={(e) => set('timeline_order', e.target.value)}
						/>
					</Field>
					<Field label="Era">
						<Input value={form.era} onChange={(e) => set('era', e.target.value)} />
					</Field>
				</div>
				<Field label="Publisher">
					<Input value={form.publisher} onChange={(e) => set('publisher', e.target.value)} />
				</Field>
				<div className="grid grid-cols-2 gap-3">
					<Field label="Published (YYYY-MM-DD)">
						<Input
							value={form.date_published}
							onChange={(e) => set('date_published', e.target.value)}
						/>
					</Field>
					<Field label="Language">
						<Input value={form.language} onChange={(e) => set('language', e.target.value)} />
					</Field>
				</div>
				<Field label="ISBNs (semicolon-separated)">
					<Input value={form.isbn} onChange={(e) => set('isbn', e.target.value)} />
				</Field>
				<Field label="Primary ISBN (must be one of the ISBNs)">
					<Input value={form.primary_isbn} onChange={(e) => set('primary_isbn', e.target.value)} />
				</Field>
				<Field label="Formats (semicolon-separated)">
					<Input value={form.format} onChange={(e) => set('format', e.target.value)} />
				</Field>
				<Field label="Cover image URL">
					<Input value={form.cover_image} onChange={(e) => set('cover_image', e.target.value)} />
				</Field>
				<div className="sm:col-span-2">
					<Field label="Synopsis">
						<textarea
							className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
							value={form.synopsis}
							onChange={(e) => set('synopsis', e.target.value)}
						/>
					</Field>
				</div>
			</section>

			<div className="flex items-center gap-3">
				<Button onClick={save} disabled={saving}>
					{saving && <Loader2 className="size-4 animate-spin" />}
					Create book
				</Button>
				<Button variant="ghost" onClick={() => router.push('/admin/books')} disabled={saving}>
					Cancel
				</Button>
			</div>
		</div>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="space-y-1.5">
			<Label className="text-muted-foreground text-xs">{label}</Label>
			{children}
		</div>
	);
}

function EnumSelect<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: readonly T[];
	onChange: (value: T) => void;
}) {
	return (
		<Select value={value} onValueChange={(v) => onChange(v as T)}>
			<SelectTrigger>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{options.map((o) => (
					<SelectItem key={o} value={o}>
						{o}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function Candidate({
	label,
	candidate,
	onUse,
}: {
	label: string;
	candidate: BookCandidate;
	onUse: () => void;
}) {
	const empty = !candidate.isbn?.length && !candidate.publisher && !candidate.date_published;
	return (
		<div className="rounded-md border border-border p-3 text-sm">
			<div className="mb-2 flex items-center justify-between">
				<span className="font-medium">{label}</span>
				<Button size="sm" variant="outline" onClick={onUse} disabled={empty}>
					Prefill
				</Button>
			</div>
			{empty ? (
				<p className="text-muted-foreground text-xs">No match</p>
			) : (
				<dl className="space-y-1 text-muted-foreground text-xs">
					<div>ISBNs: {candidate.isbn?.join(', ') || '—'}</div>
					<div>Publisher: {candidate.publisher || '—'}</div>
					<div>Published: {candidate.date_published || '—'}</div>
					<div>Language: {candidate.language || '—'}</div>
				</dl>
			)}
		</div>
	);
}
