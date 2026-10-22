import { useMemo } from 'react';

import { CharacterRow } from '@/components/enrichment/character-row';
import { Card, CardTitle } from '@/components/ui/card';
import type { Appearances } from '@/lib/wookieepedia/enrichment';
import { castPreview } from '@/lib/wookieepedia/enrichment-display';

const PREVIEW_COUNT = 5;

/**
 * Main cast preview: the first five `dramatis_personae` entries in wiki order, with a
 * "See all" link to the Characters sheet when it holds more. Render only for books
 * with a curated cast.
 */
export function CharactersCard({
	appearances,
	onSeeAll,
}: {
	appearances: Appearances;
	onSeeAll: () => void;
}) {
	const { items, hasMore } = useMemo(() => castPreview(appearances, PREVIEW_COUNT), [appearances]);
	return (
		<Card>
			<CardTitle
				trailing={
					hasMore
						? {
								kind: 'link',
								label: 'See all',
								onPress: onSeeAll,
								accessibilityLabel: 'See all characters',
								accessibilityHint: 'Opens the character list.',
							}
						: undefined
				}
			>
				Characters
			</CardTitle>
			{items.map((item) => (
				<CharacterRow key={item.key} item={item} />
			))}
		</Card>
	);
}
