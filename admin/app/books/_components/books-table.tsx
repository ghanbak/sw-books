'use client';

import { patchBook } from '@/app/_actions/books';
import { fillEmpty, refetchCover } from '@/app/_actions/bulk';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { ISSUE_DEFS, type IssueKey } from '@/lib/issues';
import { cn } from '@/lib/utils';
import { isValidIsbn } from '@app/isbn';
import type { Database } from '@app/types';
import {
	type CellContext,
	type Column,
	type RowData,
	type RowSelectionState,
	type SortingState,
	createColumnHelper,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	useReactTable,
} from '@tanstack/react-table';
import {
	ArrowDown,
	ArrowUp,
	ChevronsUpDown,
	ExternalLink,
	ImageDown,
	ListChecks,
	Wand2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useMemo, useOptimistic, useState } from 'react';
import { toast } from 'sonner';

type BookRow = Database['public']['Tables']['books']['Row'];

export type BookListRow = Pick<
	BookRow,
	| 'id'
	| 'slug'
	| 'title'
	| 'author'
	| 'canon'
	| 'era'
	| 'type'
	| 'series_name'
	| 'series_order'
	| 'primary_isbn'
	| 'isbn'
	| 'format'
	| 'publisher'
	| 'date_published'
	| 'cover_image'
>;

type RowWithIssues = BookListRow & { issues: IssueKey[] };

type EditableField = 'title' | 'publisher' | 'era' | 'date_published';

declare module '@tanstack/react-table' {
	interface TableMeta<TData extends RowData> {
		updateField: (id: string, field: EditableField, value: string | null) => void;
	}
}

function EditableText({
	value,
	nullable,
	mono,
	onCommit,
}: {
	value: string | null;
	nullable: boolean;
	mono?: boolean;
	onCommit: (next: string | null) => void;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value ?? '');

	if (!editing) {
		return (
			<button
				type="button"
				className={cn(
					'w-full cursor-text rounded px-1 py-0.5 text-left hover:bg-secondary/60',
					mono && 'font-mono text-xs',
					value == null && 'text-muted-foreground',
				)}
				onClick={() => {
					setDraft(value ?? '');
					setEditing(true);
				}}
			>
				{value ?? '—'}
			</button>
		);
	}

	const commit = () => {
		setEditing(false);
		const trimmed = draft.trim();
		const next = trimmed === '' ? (nullable ? null : value) : trimmed;
		if (next !== value) onCommit(next);
	};

	return (
		<Input
			autoFocus
			value={draft}
			className={cn('h-7 px-1 py-0.5', mono && 'font-mono text-xs')}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === 'Enter') commit();
				if (e.key === 'Escape') setEditing(false);
			}}
		/>
	);
}

function SortHeader({ column, label }: { column: Column<RowWithIssues, unknown>; label: string }) {
	const sorted = column.getIsSorted();
	return (
		<Button
			variant="ghost"
			size="sm"
			className="-ml-2 h-8"
			onClick={() => column.toggleSorting(sorted === 'asc')}
		>
			{label}
			{sorted === 'asc' ? (
				<ArrowUp className="ml-1 size-3.5" />
			) : sorted === 'desc' ? (
				<ArrowDown className="ml-1 size-3.5" />
			) : (
				<ChevronsUpDown className="ml-1 size-3.5 opacity-50" />
			)}
		</Button>
	);
}

const columnHelper = createColumnHelper<RowWithIssues>();

function editableCell(field: EditableField, opts: { nullable: boolean; mono?: boolean }) {
	return ({ getValue, row, table }: CellContext<RowWithIssues, string | null>) => (
		<EditableText
			value={getValue()}
			nullable={opts.nullable}
			mono={opts.mono}
			onCommit={(next) => table.options.meta?.updateField(row.original.id, field, next)}
		/>
	);
}

const columns = [
	columnHelper.display({
		id: 'select',
		header: ({ table }) => (
			<Checkbox
				aria-label="Select all"
				checked={
					table.getIsAllRowsSelected()
						? true
						: table.getIsSomeRowsSelected()
							? 'indeterminate'
							: false
				}
				onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
			/>
		),
		cell: ({ row }) => (
			<Checkbox
				aria-label="Select row"
				checked={row.getIsSelected()}
				onCheckedChange={(value) => row.toggleSelected(!!value)}
			/>
		),
		enableSorting: false,
	}),
	columnHelper.accessor('cover_image', {
		header: '',
		enableSorting: false,
		cell: ({ getValue, row }) => {
			const url = getValue();
			return url ? (
				<img
					src={url}
					alt=""
					className="h-12 w-8 rounded-sm border border-border object-cover"
					loading="lazy"
				/>
			) : (
				<div className="flex h-12 w-8 items-center justify-center rounded-sm border border-border bg-muted text-[10px] text-muted-foreground">
					{row.original.title.slice(0, 1)}
				</div>
			);
		},
	}),
	columnHelper.accessor('title', {
		header: ({ column }) => <SortHeader column={column} label="Title" />,
		cell: ({ getValue, row, table }) => (
			<div className="min-w-[220px]">
				<EditableText
					value={getValue()}
					nullable={false}
					onCommit={(next) => table.options.meta?.updateField(row.original.id, 'title', next)}
				/>
				<div className="px-1 text-muted-foreground text-xs">{row.original.slug}</div>
			</div>
		),
	}),
	columnHelper.accessor((r) => r.author?.join('; ') ?? '', {
		id: 'author',
		header: 'Author',
		cell: ({ getValue }) => <span className="text-sm">{getValue()}</span>,
	}),
	columnHelper.accessor('canon', {
		header: ({ column }) => <SortHeader column={column} label="Canon" />,
		cell: ({ getValue }) => {
			const isCanon = getValue() === 'Canon';
			return (
				<Badge
					variant="outline"
					className={cn(
						'border-transparent',
						isCanon ? 'bg-canon text-canon-foreground' : 'bg-legends text-legends-foreground',
					)}
				>
					{getValue()}
				</Badge>
			);
		},
	}),
	columnHelper.accessor('type', {
		header: ({ column }) => <SortHeader column={column} label="Type" />,
		cell: ({ getValue }) => <span className="text-sm">{getValue()}</span>,
	}),
	columnHelper.accessor(
		(r) =>
			r.series_name ? `${r.series_name}${r.series_order != null ? ` #${r.series_order}` : ''}` : '',
		{
			id: 'series',
			header: 'Series',
			cell: ({ getValue }) => <span className="text-muted-foreground text-sm">{getValue()}</span>,
		},
	),
	columnHelper.accessor('primary_isbn', {
		header: 'Primary ISBN',
		cell: ({ getValue }) => (
			<span className="font-mono text-xs">
				{getValue() ?? <span className="text-muted-foreground">—</span>}
			</span>
		),
	}),
	columnHelper.accessor('isbn', {
		header: 'ISBNs',
		enableSorting: false,
		cell: ({ getValue, row }) => {
			const list = getValue() ?? [];
			if (list.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
			return (
				<div className="flex max-w-[220px] flex-wrap gap-1">
					{list.map((isbn) => (
						<Badge
							key={isbn}
							variant="outline"
							className={cn(
								'font-mono text-[10px]',
								isbn === row.original.primary_isbn && 'border-saber-blue text-saber-blue',
							)}
						>
							{isbn}
						</Badge>
					))}
				</div>
			);
		},
	}),
	columnHelper.accessor('publisher', {
		header: ({ column }) => <SortHeader column={column} label="Publisher" />,
		cell: editableCell('publisher', { nullable: true }),
	}),
	columnHelper.accessor('date_published', {
		header: ({ column }) => <SortHeader column={column} label="Published" />,
		cell: editableCell('date_published', { nullable: true, mono: true }),
	}),
	columnHelper.accessor('era', {
		header: 'Era',
		cell: editableCell('era', { nullable: true }),
	}),
	columnHelper.display({
		id: 'actions',
		header: '',
		cell: ({ row }) => (
			<Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-saber-blue">
				<Link href={`/books/${row.original.slug}`}>
					Diff <ExternalLink className="size-3.5" />
				</Link>
			</Button>
		),
	}),
];

export function BooksTable({
	rows,
	counts,
}: { rows: RowWithIssues[]; counts: Record<IssueKey, number> }) {
	const router = useRouter();
	const [data, setData] = useState<RowWithIssues[]>(rows);
	const [optimisticData, applyOptimistic] = useOptimistic(
		data,
		(state, update: { id: string; field: EditableField; value: string | null }) =>
			state.map((r) => (r.id === update.id ? { ...r, [update.field]: update.value } : r)),
	);
	const [sorting, setSorting] = useState<SortingState>([]);
	const [globalFilter, setGlobalFilter] = useState('');
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [activeIssue, setActiveIssue] = useState<IssueKey | null>(null);
	const [bulk, setBulk] = useState<{ label: string; done: number; total: number } | null>(null);

	const visibleData = useMemo(
		() =>
			activeIssue ? optimisticData.filter((r) => r.issues.includes(activeIssue)) : optimisticData,
		[optimisticData, activeIssue],
	);

	const updateField = (id: string, field: EditableField, value: string | null) => {
		startTransition(async () => {
			applyOptimistic({ id, field, value });
			const res = await patchBook(id, { [field]: value });
			if (res.ok) {
				setData((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
				toast.success(`Saved ${field}`);
			} else {
				toast.error(`Update failed: ${res.error.message}`);
			}
		});
	};

	const table = useReactTable({
		data: visibleData,
		columns,
		state: { sorting, globalFilter, rowSelection },
		getRowId: (row) => row.id,
		meta: { updateField },
		onSortingChange: setSorting,
		onGlobalFilterChange: setGlobalFilter,
		onRowSelectionChange: setRowSelection,
		enableRowSelection: true,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
	});

	const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
	const selectedCount = selectedRows.length;
	const running = bulk !== null;

	async function runSequential<T extends { slug: string }>(
		label: string,
		items: T[],
		fn: (item: T) => Promise<{ status: string; message?: string }>,
	) {
		setBulk({ label, done: 0, total: items.length });
		let updated = 0;
		const failures: string[] = [];
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (!item) continue;
			const res = await fn(item);
			if (res.status === 'updated') updated++;
			if (res.status === 'error') failures.push(item.slug);
			setBulk({ label, done: i + 1, total: items.length });
		}
		setBulk(null);
		if (failures.length)
			toast.error(`${label}: ${failures.length} failed (${failures.slice(0, 3).join(', ')}…)`);
		toast.success(`${label}: ${updated} updated / ${items.length}`);
		startTransition(() => router.refresh());
	}

	function validateIsbns() {
		const bad = selectedRows.filter((r) => (r.isbn ?? []).some((i) => !isValidIsbn(i)));
		if (bad.length === 0) {
			toast.success(`All ISBNs valid across ${selectedCount} selected`);
		} else {
			toast.error(
				`${bad.length} row(s) with invalid ISBN check digits: ${bad
					.map((r) => r.slug)
					.slice(0, 5)
					.join(', ')}`,
			);
		}
	}

	return (
		<div className="flex gap-6">
			<aside className="w-52 shrink-0 space-y-1">
				<button
					type="button"
					onClick={() => setActiveIssue(null)}
					className={cn(
						'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm hover:bg-secondary/60',
						activeIssue === null && 'bg-secondary font-medium',
					)}
				>
					All books
					<span className="text-muted-foreground tabular-nums">{data.length}</span>
				</button>
				<div className="px-3 pt-3 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
					Issues
				</div>
				{ISSUE_DEFS.map((def) => (
					<button
						key={def.key}
						type="button"
						onClick={() => setActiveIssue((cur) => (cur === def.key ? null : def.key))}
						className={cn(
							'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm hover:bg-secondary/60',
							activeIssue === def.key && 'bg-secondary font-medium',
						)}
					>
						{def.label}
						<Badge variant="outline" className="ml-2 tabular-nums">
							{counts[def.key] ?? 0}
						</Badge>
					</button>
				))}
			</aside>

			<div className="min-w-0 flex-1 space-y-3">
				<div className="flex flex-wrap items-center gap-3">
					<Input
						placeholder="Filter by title, author, series, publisher…"
						value={globalFilter}
						onChange={(e) => setGlobalFilter(e.target.value)}
						className="max-w-sm"
					/>
					<span className="text-muted-foreground text-sm tabular-nums">
						{table.getFilteredRowModel().rows.length}
						{activeIssue
							? ` · ${ISSUE_DEFS.find((d) => d.key === activeIssue)?.label}`
							: ` of ${data.length}`}
					</span>
				</div>

				{selectedCount > 0 && (
					<div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
						<span className="px-1 text-saber-blue text-sm tabular-nums">
							{selectedCount} selected
						</span>
						<Button
							variant="secondary"
							size="sm"
							disabled={running}
							onClick={() =>
								runSequential('Re-fetch covers', selectedRows, (r) => refetchCover(r.slug))
							}
						>
							<ImageDown className="size-4" /> Re-fetch covers
						</Button>
						<Button variant="secondary" size="sm" disabled={running} onClick={validateIsbns}>
							<ListChecks className="size-4" /> Validate ISBNs
						</Button>
						<Button
							variant="secondary"
							size="sm"
							disabled={running}
							onClick={() => runSequential('Fill empty', selectedRows, (r) => fillEmpty(r.slug))}
						>
							<Wand2 className="size-4" /> Fill empty
						</Button>
						<Button
							variant="ghost"
							size="sm"
							disabled={running}
							onClick={() => setRowSelection({})}
						>
							Clear
						</Button>
						{bulk && (
							<div className="ml-auto flex items-center gap-2">
								<Progress value={(bulk.done / Math.max(bulk.total, 1)) * 100} className="w-32" />
								<span className="text-muted-foreground text-xs tabular-nums">
									{bulk.label} {bulk.done}/{bulk.total}
								</span>
							</div>
						)}
					</div>
				)}

				<div className="overflow-hidden rounded-lg border border-border">
					<Table>
						<TableHeader>
							{table.getHeaderGroups().map((headerGroup) => (
								<TableRow key={headerGroup.id} className="hover:bg-transparent">
									{headerGroup.headers.map((header) => (
										<TableHead key={header.id} className="whitespace-nowrap">
											{header.isPlaceholder
												? null
												: flexRender(header.column.columnDef.header, header.getContext())}
										</TableHead>
									))}
								</TableRow>
							))}
						</TableHeader>
						<TableBody>
							{table.getRowModel().rows.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={columns.length}
										className="h-24 text-center text-muted-foreground"
									>
										No transmissions received — adjust the filter or search.
									</TableCell>
								</TableRow>
							) : (
								table.getRowModel().rows.map((row) => (
									<TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
										{row.getVisibleCells().map((cell) => (
											<TableCell key={cell.id} className="py-1.5 align-top">
												{flexRender(cell.column.columnDef.cell, cell.getContext())}
											</TableCell>
										))}
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			</div>
		</div>
	);
}
