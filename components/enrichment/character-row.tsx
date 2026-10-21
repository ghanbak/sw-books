import { SymbolView } from 'expo-symbols';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { openInAppBrowser } from '@/lib/external-link';
import {
	type CharacterItem,
	characterAccessibilityLabel,
} from '@/lib/wookieepedia/enrichment-display';
import { wikiUrl } from '@/lib/wookieepedia/url';

/** From this text size the trailing "mentioned" cue moves to the start of line 2. */
const STACK_CUE_FONT_SCALE = 1.35;
const CUE = 'mentioned';

/**
 * One character, text only (Figma `Enrichment / Character Row` 259:29): name + optional
 * note. Mention-only rows dim the name and add the "mentioned" cue word (not color alone).
 * Linked rows open the wiki page in the in-app browser and carry a trailing chevron;
 * unlinked rows keep an empty chevron slot so cue words stay aligned down the list.
 */
export const CharacterRow = memo(function CharacterRow({ item }: { item: CharacterItem }) {
	const { fontScale } = useWindowDimensions();
	const stackCue = item.mentioned && fontScale >= STACK_CUE_FONT_SCALE;
	const { page } = item;
	const onPress = useCallback(() => {
		if (page) openInAppBrowser(wikiUrl(page));
	}, [page]);

	const secondLine = stackCue ? (item.note ? `${CUE} · ${item.note}` : CUE) : item.note;

	const content = (
		<>
			<View style={styles.text}>
				<Text style={[styles.name, item.mentioned && styles.nameMentioned]}>{item.name}</Text>
				{secondLine ? <Text style={styles.note}>{secondLine}</Text> : null}
			</View>
			{item.mentioned && !stackCue ? <Text style={styles.cue}>{CUE}</Text> : null}
			<View style={styles.chevronSlot}>
				{page ? (
					<SymbolView
						name="chevron.forward"
						size={15}
						weight="medium"
						tintColor={tokens.text.hint}
					/>
				) : null}
			</View>
		</>
	);

	const label = characterAccessibilityLabel(item);

	if (!page) {
		return (
			<View style={styles.row} accessible accessibilityRole="text" accessibilityLabel={label}>
				{content}
			</View>
		);
	}

	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="link"
			accessibilityLabel={label}
			accessibilityHint="Opens on Wookieepedia."
			style={({ pressed }) => [styles.row, pressed && styles.pressed]}
		>
			{content}
		</Pressable>
	);
});

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		minHeight: 44,
		paddingVertical: 8,
	},
	pressed: {
		opacity: 0.6,
	},
	text: {
		flex: 1,
		gap: 2,
	},
	name: {
		fontSize: 15,
		lineHeight: 20,
		fontWeight: '500',
		letterSpacing: -0.23,
		color: tokens.text.primary,
	},
	nameMentioned: {
		color: tokens.text.secondary,
	},
	note: {
		fontSize: 13,
		lineHeight: 18,
		letterSpacing: -0.08,
		color: tokens.text.secondary,
	},
	cue: {
		fontSize: 13,
		lineHeight: 18,
		letterSpacing: -0.08,
		color: tokens.text.secondary,
		textAlign: 'right',
		flexShrink: 0,
	},
	chevronSlot: {
		width: 12,
		alignItems: 'center',
	},
});
