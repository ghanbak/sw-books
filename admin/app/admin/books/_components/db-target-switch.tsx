'use client';

import { setDbTarget } from '@/app/_actions/db-target';
import { Switch } from '@/components/ui/switch';
import type { DbTarget } from '@/lib/supabase-admin';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

/**
 * Toggle the admin's active database. Off = local, On = production. Persists via
 * the setDbTarget server action (cookie) and refreshes so the catalog re-queries
 * the chosen target. Production is highlighted so it's obvious when edits go live.
 */
export function DbTargetSwitch({ current }: { current: DbTarget }) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const isProd = current === 'prod';

	function toggle(checked: boolean) {
		const next: DbTarget = checked ? 'prod' : 'local';
		start(async () => {
			await setDbTarget(next);
			router.refresh();
			toast.message(next === 'prod' ? 'Switched to Production' : 'Switched to Local');
		});
	}

	return (
		<span className="inline-flex items-center gap-2">
			<span className={cn('text-xs', isProd ? 'text-muted-foreground' : 'text-foreground')}>
				Local
			</span>
			<Switch
				checked={isProd}
				onCheckedChange={toggle}
				disabled={pending}
				aria-label="Toggle database target between local and production"
				className={cn(isProd && 'data-[state=checked]:bg-saber-yellow')}
			/>
			<span
				className={cn(
					'text-xs',
					isProd ? 'font-medium text-saber-yellow' : 'text-muted-foreground',
				)}
			>
				Production
			</span>
		</span>
	);
}
