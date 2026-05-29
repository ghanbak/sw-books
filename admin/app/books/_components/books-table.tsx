'use client';

import type { Database } from '@app/types';
import {
	type Column,
	type RowSelectionState,
	type SortingState,
	createColumnHelper,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
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

function SortHeader({ column, label }: { column: Column<BookListRow, unknown>; label: string }) {
	const sorted = column.getIsSorted();
	return (
		<Button
			variant="ghost"
			size="sm"
			className="-ml-2 h-8 data-[state=open]:bg-accent"
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
				// biome-ignore lint/performance/noImgElement: admin-only tool, remote covers, no next/image config
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
		cell: ({ getValue, row }) => (
			<div className="min-w-[200px]">
				<div className="font-medium leading-tight">{getValue()}</div>
				<div className="text-muted-foreground text-xs">{row.original.slug}</div>
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
			const v = getValue();
			const isCanon = v === 'Canon';
			return (
				<Badge
					variant="outline"
					className={cn(
						'border-transparent',
						isCanon
							? 'bg-canon text-canon-foreground'
							: 'bg-legends text-legends-foreground',
					)}
				>
					{v}
				</Badge>
			);
		},
	}),
	columnHelper.accessor('type', {
		header: ({ column }) => <SortHeader column={column} label="Type" />,
		cell: ({ getValue }) => <span className="text-sm">{getValue()}</span>,
	}),
	columnHelper.accessor(
		(r) => (r.series_name ? `${r.series_name}${r.series_order != null ? ` #${r.series_order}` : ''}` : ''),
		{
			id: 'series',
			header: 'Series',
			cell: ({ getValue }) => <span className="text-muted-foreground text-sm">{getValue()}</span>,
		},
	),
	columnHelper.accessor('primary_isbn', {
		header: 'Primary ISBN',
		cell: ({ getValue }) => (
			<span className="font-mono text-xs">{getValue() ?? <span className="text-muted-foreground">—</span>}</span>
		),
	}),
	columnHelper.accessor((r) => r.format?.join(', ') ?? '', {
		id: 'format',
		header: 'Format',
		cell: ({ getValue }) => <span className="text-muted-foreground text-xs">{getValue()}</span>,
	}),
	columnHelper.accessor('publisher', {
		header: ({ column }) => <SortHeader column={column} label="Publisher" />,
		cell: ({ getValue }) => <span className="text-sm">{getValue() ?? ''}</span>,
	}),
	columnHelper.accessor('date_published', {
		header: ({ column }) => <SortHeader column={column} label="Published" />,
		cell: ({ getValue }) => (
			<span className="whitespace-nowrap text-muted-foreground text-xs">{getValue() ?? ''}</span>
		),
	}),
];

export function BooksTable({ rows }: { rows: BookListRow[] }) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [globalFilter, setGlobalFilter] = useState('');
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

	const table = useReactTable({
		data: rows,
		columns,
		state: { sorting, globalFilter, rowSelection },
		getRowId: (row) => row.id,
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
					{filteredCount} of {rows.length}
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
										<TableCell key={cell.id} className="py-2">
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
