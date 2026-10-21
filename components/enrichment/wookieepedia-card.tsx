import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Card } from '@/components/ui/card';
import { SubtleButton } from '@/components/ui/subtle-button';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { openInAppBrowser } from '@/lib/external-link';
import type { Enrichment } from '@/lib/wookieepedia/enrichment';
import { formatAttributionLine } from '@/lib/wookieepedia/enrichment-display';

/**
 * Source link + CC BY-SA attribution (Figma `Enrichment / Wookieepedia Attribution`,
 * Layout=Card). On the detail screen and as the Characters sheet footer.
 *
 * The attribution line is `text.hint` on purpose (user decision 2026-10-21): it stays
 * quiet even though 2.7:1 is below AA for 12pt text. Don't "fix" it to secondary.
 */
export function WookieepediaCard({
	enrichment,
	style,
}: {
	enrichment: Pick<Enrichment, 'source_url' | 'attribution' | 'license'>;
	style?: ViewStyle;
}) {
	return (
		<Card style={style}>
			<View style={styles.body}>
				<SubtleButton
					label="View on Wookieepedia"
					icon="arrow.up.forward.app"
					onCard
					fullWidth
					accessibilityRole="link"
					onPress={() => openInAppBrowser(enrichment.source_url)}
				/>
				<Text style={styles.attribution}>
					{formatAttributionLine(enrichment.attribution, enrichment.license)}
				</Text>
			</View>
		</Card>
	);
}

const styles = StyleSheet.create({
	body: {
		paddingTop: 8,
		gap: 8,
	},
	attribution: {
		fontSize: 12,
		lineHeight: 16,
		color: tokens.text.hint,
		textAlign: 'center',
	},
});
