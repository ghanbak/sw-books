import type { DbTarget } from '@/lib/supabase-admin';
import { cn } from '@/lib/utils';

/**
 * Read-only DB target for pages that write but don't host the switch. Shows the
 * target the page rendered with, which is the one its writes send back (#487).
 */
export function DbTargetLabel({ target }: { target: DbTarget }) {
	const isProd = target === 'prod';
	return (
		<span className="text-muted-foreground text-xs">
			Writes to{' '}
			<span className={cn('font-medium', isProd ? 'text-saber-yellow' : 'text-foreground')}>
				{isProd ? 'Production' : 'Local'}
			</span>
		</span>
	);
}
