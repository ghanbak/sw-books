import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CharacterRow } from '@/components/enrichment/character-row';
import { WookieepediaCard } from '@/components/enrichment/wookieepedia-card';
import { ErrorState } from '@/components/error-state';
import { CARD_PADDING, CARD_RADIUS, CardNotch, CardTitle } from '@/components/ui/card';
import { GlassIconButton } from '@/components/ui/glass-icon-button';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { announce } from '@/hooks/useAccessibility';
import { useBookEnrichment } from '@/lib/hooks';
import type { Enrichment } from '@/lib/wookieepedia/enrichment';
import {
	type CharacterListRow,
	buildCharacterRows,
	normalizeSearch,
} from '@/lib/wookieepedia/enrichment-display';

const SCREEN_PADDING = 20;
const ANNOUNCE_DELAY_MS = 600;

type SheetItem =
	| { type: 'search'; key: 'search' }
	| CharacterListRow
	| { type: 'empty'; key: 'empty' }
	| { type: 'footer'; key: 'footer' };

const SEARCH_ITEM: SheetItem = { type: 'search', key: 'search' };
const EMPTY_ITEM: SheetItem = { type: 'empty', key: 'empty' };
const FOOTER_ITEM: SheetItem = { type: 'footer', key: 'footer' };
const NO_MVCP = { disabled: true } as const;

/**
 * Characters sheet (form sheet, full height): every character in the book, main cast
 * first, searchable over name + note. Data comes from the `useBookEnrichment` module
 * cache the detail screen filled; a cold entry (deep link) fetches.
 */
export default function CharactersSheet() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const { status, enrichment, retry } = useBookEnrichment(id);

	const close = useCallback(() => {
		if (router.canGoBack()) router.back();
		else router.replace({ pathname: '/book/[id]', params: { id } });
	}, [router, id]);

	const total = useMemo(
		() => (enrichment ? buildCharacterRows(enrichment.appearances, '').total : 0),
		[enrichment],
	);

	return (
		<View style={styles.root}>
			<SheetHeader total={status === 'ready' && enrichment ? total : null} onClose={close} />
			{status === 'loading' ? (
				<View style={styles.center}>
					<ActivityIndicator color={tokens.text.secondary} />
				</View>
			) : status === 'error' ? (
				<ErrorState title="Couldn't load characters" onRetry={retry} />
			) : enrichment ? (
				<CharacterList enrichment={enrichment} />
			) : (
				<View style={styles.center}>
					<Text style={styles.emptyText}>No characters</Text>
				</View>
			)}
		</View>
	);
}

function SheetHeader({ total, onClose }: { total: number | null; onClose: () => void }) {
	return (
		<View style={styles.header}>
			<GlassIconButton icon="xmark" size={44} onPress={onClose} accessibilityLabel="Close" />
			<View style={styles.headerTitles}>
				<Text style={styles.headerTitle} accessibilityRole="header">
					Characters
				</Text>
				{total !== null && (
					<Text style={styles.headerSubtitle}>{`${total.toLocaleString()} in this book`}</Text>
				)}
			</View>
			{/* Balances the close button so the title stays centered. */}
			<View style={styles.headerSpacer} />
		</View>
	);
}

function CharacterList({ enrichment }: { enrichment: Enrichment }) {
	const insets = useSafeAreaInsets();
	const [query, setQuery] = useState('');
	const deferredQuery = useDeferredValue(query);
	const searching = normalizeSearch(deferredQuery) !== '';

	const { rows, castCount, otherCount } = useMemo(
		() => buildCharacterRows(enrichment.appearances, deferredQuery),
		[enrichment, deferredQuery],
	);
	const matches = castCount + otherCount;

	const data = useMemo<SheetItem[]>(
		() => [SEARCH_ITEM, ...(rows.length > 0 ? rows : searching ? [EMPTY_ITEM] : []), FOOTER_ITEM],
		[rows, searching],
	);

	// Speak the result count once typing settles.
	useEffect(() => {
		if (!searching) return;
		const timer = setTimeout(
			() => announce(`${matches.toLocaleString()} ${matches === 1 ? 'match' : 'matches'}`),
			ANNOUNCE_DELAY_MS,
		);
		return () => clearTimeout(timer);
	}, [searching, matches]);

	const footerPadding = insets.bottom + 16;
	const renderItem = useCallback(
		({ item }: ListRenderItemInfo<SheetItem>) => {
			switch (item.type) {
				case 'search':
					return <SearchField value={query} onChangeText={setQuery} />;
				case 'header':
					return (
						<View style={[styles.cardSlice, styles.cardTop]}>
							<CardTitle trailing={{ kind: 'count', value: item.count }}>{item.title}</CardTitle>
						</View>
					);
				case 'entry':
					return (
						<View style={styles.cardSlice}>
							<CharacterRow item={item.item} />
						</View>
					);
				case 'section-end':
					return <SectionEnd />;
				case 'gap':
					return <View style={styles.gap} />;
				case 'empty':
					return <Text style={styles.noMatches}>No matches</Text>;
				case 'footer':
					return (
						<View style={[styles.footer, { paddingBottom: footerPadding }]}>
							<WookieepediaCard enrichment={enrichment} />
						</View>
					);
			}
		},
		[query, enrichment, footerPadding],
	);

	return (
		<FlashList
			data={data}
			renderItem={renderItem}
			keyExtractor={keyExtractor}
			getItemType={getItemType}
			keyboardDismissMode="on-drag"
			keyboardShouldPersistTaps="handled"
			// Filtering replaces the data; don't anchor the old scroll position.
			maintainVisibleContentPosition={NO_MVCP}
		/>
	);
}

function keyExtractor(item: SheetItem): string {
	return item.key;
}

function getItemType(item: SheetItem): SheetItem['type'] {
	return item.type;
}

/** Bottom of a section card: the body's bottom padding + the datapad notch. */
const SectionEnd = memo(function SectionEnd() {
	return (
		<View style={[styles.cardSlice, styles.cardBottom]}>
			<View style={styles.cardBottomPadding} />
			<CardNotch />
		</View>
	);
});

const SearchField = memo(function SearchField({
	value,
	onChangeText,
}: {
	value: string;
	onChangeText: (text: string) => void;
}) {
	return (
		<View style={styles.searchWrap}>
			<View style={styles.searchField}>
				<SymbolView
					name="magnifyingglass"
					size={17}
					weight="medium"
					tintColor={tokens.text.secondary}
				/>
				<TextInput
					value={value}
					onChangeText={onChangeText}
					placeholder="Search characters"
					placeholderTextColor={tokens.text.hint}
					style={styles.searchInput}
					returnKeyType="search"
					clearButtonMode="while-editing"
					autoCorrect={false}
					autoCapitalize="none"
					keyboardAppearance="dark"
					selectionColor={tokens.accent.primary}
					accessibilityRole="search"
					accessibilityLabel="Search characters"
				/>
			</View>
		</View>
	);
});

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: tokens.surface.background,
	},
	center: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	emptyText: {
		fontSize: 15,
		lineHeight: 20,
		color: tokens.text.secondary,
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingTop: 16,
		paddingBottom: 10,
		paddingHorizontal: 16,
		backgroundColor: tokens.surface.background,
	},
	headerTitles: {
		flex: 1,
		alignItems: 'center',
	},
	headerTitle: {
		fontSize: 17,
		lineHeight: 22,
		fontWeight: '600',
		color: tokens.text.primary,
		textAlign: 'center',
	},
	headerSubtitle: {
		fontSize: 13,
		lineHeight: 18,
		color: tokens.text.secondary,
		textAlign: 'center',
		fontVariant: ['tabular-nums'],
	},
	headerSpacer: {
		width: 44,
	},
	searchWrap: {
		paddingHorizontal: SCREEN_PADDING,
		paddingBottom: 12,
	},
	searchField: {
		minHeight: 48,
		borderRadius: 24,
		backgroundColor: tokens.surface.card,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingLeft: 16,
		paddingRight: 8,
	},
	searchInput: {
		flex: 1,
		minHeight: 48,
		fontSize: 17,
		color: tokens.text.primary,
	},
	// A section is one Card drawn across rows: top (title), slices (rows), bottom (notch).
	cardSlice: {
		marginHorizontal: SCREEN_PADDING,
		paddingHorizontal: CARD_PADDING,
		backgroundColor: tokens.surface.card,
	},
	cardTop: {
		paddingTop: CARD_PADDING,
		borderTopLeftRadius: CARD_RADIUS,
		borderTopRightRadius: CARD_RADIUS,
	},
	cardBottom: {
		paddingHorizontal: 0,
		borderBottomLeftRadius: CARD_RADIUS,
		borderBottomRightRadius: CARD_RADIUS,
		overflow: 'hidden',
	},
	cardBottomPadding: {
		height: CARD_PADDING,
	},
	gap: {
		height: 12,
	},
	noMatches: {
		paddingTop: 48,
		fontSize: 15,
		lineHeight: 20,
		color: tokens.text.secondary,
		textAlign: 'center',
	},
	footer: {
		marginTop: 12,
		paddingHorizontal: SCREEN_PADDING,
	},
});
