import { X } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from '@/constants/tokens';
import { GlassView, liquidGlassAvailable } from '@/lib/glass';

type Props = {
	visible: boolean;
	onClose: () => void;
};

export function AffiliateDisclosureSheet({ visible, onClose }: Props) {
	const Surface = liquidGlassAvailable ? GlassView : View;

	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={onClose}
		>
			<Surface style={[styles.container, !liquidGlassAvailable && styles.containerFallback]}>
				{/* iOS-style drag handle. pageSheet sometimes draws one natively but
				    not consistently across iOS versions, so we render our own. */}
				<View style={styles.dragIndicator} />

				<View style={styles.header}>
					<Text style={styles.title}>Affiliate Disclosure</Text>
					<Pressable
						style={styles.closeButton}
						onPress={onClose}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel="Close"
					>
						<X size={20} color={tokens.text.secondary} strokeWidth={2.5} />
					</Pressable>
				</View>

				<View style={styles.body}>
					<Text style={styles.bodyText}>
						Ossus Archives is a participant in the Amazon Services LLC Associates Program. Tapping
						"Find on Amazon" opens Amazon's website. As an Associate I earn from qualifying
						purchases — at no extra cost to you.
					</Text>

					<Text style={styles.footnote}>
						You can read the full Amazon Associates terms at{' '}
						<Text style={styles.link}>affiliate-program.amazon.com</Text>.
					</Text>
				</View>
			</Surface>
		</Modal>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	containerFallback: {
		backgroundColor: tokens.surface.background,
	},
	dragIndicator: {
		alignSelf: 'center',
		width: 36,
		height: 5,
		borderRadius: 100,
		backgroundColor: 'rgba(255, 255, 255, 0.18)',
		marginTop: 8,
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingTop: 16,
		paddingLeft: 24,
		paddingRight: 14, // visually balances closeButton's optical right-edge
		paddingBottom: 16,
	},
	title: {
		fontSize: 20,
		fontWeight: '700',
		letterSpacing: 0.4,
		color: tokens.text.primary,
	},
	closeButton: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: tokens.surface.card,
		alignItems: 'center',
		justifyContent: 'center',
	},
	body: {
		paddingHorizontal: 24,
		paddingTop: 8,
	},
	bodyText: {
		fontSize: 15,
		lineHeight: 23,
		color: tokens.text.primary,
		marginBottom: 16,
	},
	footnote: {
		fontSize: 13,
		lineHeight: 19,
		color: tokens.text.hint,
	},
	link: {
		color: tokens.accent.primary,
	},
});
