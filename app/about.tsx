import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/card';
import { tokens } from '@/constants/tokens';

const APP_VERSION = '1.0.0';

/**
 * About screen — pushed from the Profile sheet. Hosts the Amazon affiliate
 * disclosure (moved here from the book detail screen) and app info.
 */
export default function AboutScreen() {
	const insets = useSafeAreaInsets();
	return (
		<ScrollView
			style={styles.container}
			contentContainerStyle={[
				styles.content,
				{ paddingTop: insets.top, paddingBottom: insets.bottom },
			]}
		>
			<Card>
				<Text style={styles.cardTitle}>Affiliate disclosure</Text>
				<Text style={styles.body}>
					OssusArchives is a participant in the Amazon Services LLC Associates Program. Tapping
					“Find on Amazon” opens Amazon’s website. As an Associate we earn from qualifying purchases
					— at no extra cost to you.
				</Text>
				<Text style={styles.footnote}>
					You can read the full Amazon Associates terms at affiliate-program.amazon.com.
				</Text>
			</Card>

			<Text style={styles.version}>OssusArchives v{APP_VERSION}</Text>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: tokens.surface.background,
	},
	content: {
		padding: 16,
		gap: 16,
	},
	cardTitle: {
		fontSize: 11,
		fontWeight: '700',
		color: tokens.text.hint,
		textTransform: 'uppercase',
		letterSpacing: 1.2,
		marginBottom: 8,
	},
	body: {
		fontSize: 15,
		lineHeight: 23,
		color: tokens.text.primary,
		marginBottom: 12,
	},
	footnote: {
		fontSize: 13,
		lineHeight: 19,
		color: tokens.text.hint,
	},
	version: {
		fontSize: 12,
		color: tokens.text.hint,
		textAlign: 'center',
	},
});
