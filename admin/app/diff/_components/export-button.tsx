'use client';

import { Loader2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
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

export function ExportButton({ disabled, rows }: { disabled: boolean; rows: number }) {
	const router = useRouter();
	const [pending, startExport] = useTransition();

	function run() {
		startExport(async () => {
			const res = await exportToCsv();
			if (res.ok) {
				toast.success(`Exported · ${res.data.csvRowsChanged} CSV rows, ${res.data.overrideEntriesChanged} overrides`);
				router.refresh();
			} else {
				toast.error(`Export failed: ${res.error.message}`);
			}
		});
	}

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button disabled={disabled || pending}>
					{pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
					Export to CSV
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Export {rows} changed row(s) to data/?</AlertDialogTitle>
					<AlertDialogDescription>
						Writes scalar fields to <code>data/books.csv</code> and the four manual-override JSONs. Recovery
						if anything looks wrong: <code>git checkout data/</code>. Then verify with{' '}
						<code>npm run db:reset && npm run db:seed</code> — drift should return to 0.
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
