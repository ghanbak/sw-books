import { getDriftReport } from '@/app/_actions/export';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { ExportButton } from './_components/export-button';

export const dynamic = 'force-dynamic';

export default async function DiffPage() {
	const res = await getDriftReport();

	return (
		<main className="mx-auto max-w-5xl p-6">
			<Link
				href="/admin/books"
				className="mb-4 inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
			>
				<ArrowLeft className="size-4" /> Catalog
			</Link>

			{!res.ok ? (
				<p className="text-destructive">Failed to compute drift: {res.error.message}</p>
			) : (
				<>
					<div className="mb-6 flex items-center justify-between gap-4">
						<div>
							<h1 className="font-semibold text-2xl tracking-tight">Unsaved changes</h1>
							<p className="text-muted-foreground text-sm tabular-nums">
								{res.data.summary.rows} row(s) · {res.data.summary.fields} field(s) differ from{' '}
								<code className="text-saber-blue">data/</code>
							</p>
						</div>
						<ExportButton disabled={res.data.summary.rows === 0} rows={res.data.summary.rows} />
					</div>

					{res.data.changedRows.length === 0 ? (
						<p className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
							All systems nominal — the database matches{' '}
							<code className="text-saber-blue">data/books.csv</code>.
						</p>
					) : (
						<div className="space-y-4">
							{res.data.changedRows.map((row) => (
								<div key={row.slug} className="rounded-lg border border-border bg-card p-4">
									<div className="mb-2 flex items-baseline gap-2">
										<Link
											href={`/admin/books/${row.slug}`}
											className="font-medium hover:text-saber-blue"
										>
											{row.title}
										</Link>
										<span className="font-mono text-muted-foreground text-xs">{row.slug}</span>
										<Badge variant="outline" className="ml-auto tabular-nums">
											{row.fields.length} field(s)
										</Badge>
									</div>
									<div className="space-y-1">
										{row.fields.map((f) => (
											<div
												key={f.field}
												className="grid grid-cols-[120px_1fr_auto_1fr] items-start gap-2 text-sm"
											>
												<span className="font-medium text-muted-foreground">{f.field}</span>
												<span className="text-muted-foreground line-through">{f.from}</span>
												<ArrowRight className="size-3.5 self-center text-muted-foreground" />
												<span className="text-saber-blue">{f.to}</span>
											</div>
										))}
									</div>
								</div>
							))}
						</div>
					)}
				</>
			)}
		</main>
	);
}
