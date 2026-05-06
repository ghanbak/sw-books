import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { X } from 'lucide-react-native';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tokens } from '@/constants/tokens';

type Props = {
	visible: boolean;
	onClose: () => void;
};

const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

export function AffiliateDisclosureSheet({ visible, onClose }: Props) {
	const insets = useSafeAreaInsets();
	const Surface = useLiquidGlass ? GlassView : View;

	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={onClose}
		>
			<Surface
				style={[
					styles.container,
					!useLiquidGlass && styles.containerFallback,
					{ paddingTop: insets.top + 16 },
				]}
			>
				<View style={styles.header}>
					<Text style={styles.title}>Affiliate Disclosure</Text>
					<Pressable
						style={styles.closeButton}
						onPress={onClose}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel="Close"
					>
						<X size={22} color={tokens.text.primary} strokeWidth={2} />
					</Pressable>
				</View>

				<Text style={styles.body}>
					Ossus Archives is a participant in the Amazon Services LLC Associates Program. Tapping
					"Find on Amazon" opens Amazon's website. As an Associate I earn from qualifying purchases
					— at no extra cost to you.
				</Text>

				<Text style={styles.footnote}>
					You can read the full Amazon Associates terms at{' '}
					<Text style={styles.link}>affiliate-program.amazon.com</Text>.
				</Text>
			</Surface>
		</Modal>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		paddingHorizontal: 24,
	},
	containerFallback: {
		backgroundColor: tokens.surface.background,
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 20,
	},
	title: {
		fontSize: 20,
		fontWeight: '700',
		letterSpacing: 1,
		color: tokens.text.primary,
	},
	closeButton: {
		width: 36,
		height: 36,
		alignItems: 'center',
		justifyContent: 'center',
	},
	body: {
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
