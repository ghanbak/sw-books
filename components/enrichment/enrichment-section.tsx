import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { CharactersCard } from '@/components/enrichment/characters-card';
import { TimelineCard } from '@/components/enrichment/timeline-card';
import { WookieepediaCard } from '@/components/enrichment/wookieepedia-card';
import type { Enrichment } from '@/lib/wookieepedia/enrichment';
import { parseTimeline } from '@/lib/wookieepedia/enrichment-display';

const ENTERING = FadeIn.duration(200).reduceMotion(ReduceMotion.System);

/**
 * The Wookieepedia stack on the book detail screen: Timeline → Characters → Wookieepedia.
 * Renders nothing when there's neither a timeline nor a curated cast (a lone attribution
 * card reads as a bug). Fades in on first arrival; a cache hit appears immediately.
 */
export function EnrichmentSection({
	enrichment,
	fromCache,
	onSeeAllCharacters,
}: {
	enrichment: Enrichment;
	fromCache: boolean;
	onSeeAllCharacters: () => void;
}) {
	const segments = useMemo(() => parseTimeline(enrichment.timeline_notes), [enrichment]);
	const hasCast = enrichment.appearances.dramatis_personae.length > 0;
	if (segments.length === 0 && !hasCast) return null;

	return (
		<Animated.View entering={fromCache ? undefined : ENTERING} style={styles.stack}>
			{segments.length > 0 && <TimelineCard segments={segments} />}
			{hasCast && (
				<CharactersCard appearances={enrichment.appearances} onSeeAll={onSeeAllCharacters} />
			)}
			<WookieepediaCard enrichment={enrichment} />
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	stack: {
		gap: 12,
		marginBottom: 20,
	},
});
