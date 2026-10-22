import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
	ENRICHMENT_STATUS_LABELS,
	type EnrichmentStatus,
} from '@app/wookieepedia/enrichment-status';

const STYLES: Record<EnrichmentStatus, string> = {
	enriched: 'border-saber-blue/40 bg-saber-blue/10 text-saber-blue',
	pinned: 'border-saber-yellow/40 bg-saber-yellow/10 text-saber-yellow',
	flagged: 'border-destructive/50 bg-destructive/15 text-destructive',
	no_page: 'text-muted-foreground',
};

/** Enrichment status chip. `reason` (flag detail) is exposed as a tooltip and to screen readers. */
export function EnrichmentStatusBadge({
	status,
	reason,
	className,
}: {
	status: EnrichmentStatus;
	reason?: string | null;
	className?: string;
}) {
	return (
		<Badge variant="outline" className={cn(STYLES[status], className)} title={reason ?? undefined}>
			{ENRICHMENT_STATUS_LABELS[status]}
			{reason ? <span className="sr-only">: {reason}</span> : null}
		</Badge>
	);
}
