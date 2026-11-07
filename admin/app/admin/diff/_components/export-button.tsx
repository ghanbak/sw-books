'use client';

import { exportToCsv } from '@/app/_actions/export';
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
import { Button } from '@/components/ui/button';
import { Loader2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import type { DbTarget } from '@/lib/supabase-admin';

export function ExportButton({ rows, target }: { rows: number; target: DbTarget }) {
	const router = useRouter();
	const [pending, startExport] = useTransition();

	function run() {
		startExport(async () => {
			const res = await exportToCsv();
			if (res.ok) {
				toast.success(`Exported ${res.data.rows} rows to data/catalog-backup.csv`);
				router.refresh();
			} else {
				toast.error(`Export failed: ${res.error.message}`);
			}
		});
	}

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button disabled={rows === 0 || target !== 'prod' || pending}>
					{pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
					Export to CSV
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Rewrite data/catalog-backup.csv from Prod?</AlertDialogTitle>
					<AlertDialogDescription>
						Writes every production row ({rows} changed) to <code>data/catalog-backup.csv</code>,
						the same file <code>npm run catalog:backup</code> produces. Review{' '}
						<code>git diff data/catalog-backup.csv</code> and commit it. Recovery:{' '}
						<code>git checkout data/catalog-backup.csv</code>.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={run}>Export</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
