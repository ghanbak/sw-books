'use client';

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
import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { startTransition, useOptimistic, useState } from 'react';
import { toast } from 'sonner';
import { patchBook } from '@/app/_actions/books';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

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

// Scalar string columns editable inline; arrays/enums/ISBN/cover are edited on
// the /books/[slug] detail page.
type EditableField = 'title' | 'publisher' | 'era' | 'date_published';

declare module '@tanstack/react-table' {
	// biome-ignore lint/correctness/noUnusedVariables: TData is required to match TanStack's interface signature
	interface TableMeta<TData extends RowData> {
		updateField: (id: string, field: EditableField, value: string | null) => void;
	}
}

function EditableText({
	value,
	nullable,
	mono,
	placeholder,
	onCommit,
}: {
	value: string | null;
	nullable: boolean;
	mono?: boolean;
	placeholder?: string;
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
				{value ?? placeholder ?? '—'}
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
			// biome-ignore lint/a11y/noAutofocus: intentional — focus the field the user clicked to edit
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

function SortHeader({ column, label }: { column: Column<BookListRow, unknown>; label: string }) {
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

const columnHelper = createColumnHelper<BookListRow>();

function editableCell(field: EditableField, opts: { nullable: boolean; mono?: boolean }) {
	return ({ getValue, row, table }: CellContext<BookListRow, string | null>) => (
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
					table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? 'indeterminate' : false
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
				// biome-ignore lint/performance/noImgElement: admin-only tool, remote covers, no next/image config
				<img src={url} alt="" className="h-12 w-8 rounded-sm border border-border object-cover" loading="lazy" />
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
	columnHelper.accessor((r) => (r.series_name ? `${r.series_name}${r.series_order != null ? ` #${r.series_order}` : ''}` : ''), {
		id: 'series',
		header: 'Series',
		cell: ({ getValue }) => <span className="text-muted-foreground text-sm">{getValue()}</span>,
	}),
	columnHelper.accessor('primary_isbn', {
		header: 'Primary ISBN',
		cell: ({ getValue }) => (
			<span className="font-mono text-xs">{getValue() ?? <span className="text-muted-foreground">—</span>}</span>
		),
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

export function BooksTable({ rows }: { rows: BookListRow[] }) {
	const [data, setData] = useState<BookListRow[]>(rows);
	const [optimisticData, applyOptimistic] = useOptimistic(
		data,
		(state, update: { id: string; field: EditableField; value: string | null }) =>
			state.map((r) => (r.id === update.id ? { ...r, [update.field]: update.value } : r)),
	);
	const [sorting, setSorting] = useState<SortingState>([]);
	const [globalFilter, setGlobalFilter] = useState('');
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

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
		data: optimisticData,
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

	const selectedCount = Object.keys(rowSelection).length;
	const filteredCount = table.getFilteredRowModel().rows.length;

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-3">
				<Input
					placeholder="Filter by title, author, series, publisher…"
					value={globalFilter}
					onChange={(e) => setGlobalFilter(e.target.value)}
					className="max-w-sm"
				/>
				<span className="text-muted-foreground text-sm tabular-nums">
					{filteredCount} of {data.length}
				</span>
				{selectedCount > 0 && (
					<div className="ml-auto flex items-center gap-2">
						<span className="text-saber-blue text-sm tabular-nums">{selectedCount} selected</span>
						<Button variant="ghost" size="sm" onClick={() => setRowSelection({})}>
							Clear
						</Button>
					</div>
				)}
			</div>

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
								<TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
									No books match the filter.
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
	);
}
