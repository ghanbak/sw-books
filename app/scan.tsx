import { useCameraPermissions } from 'expo-camera';
import { openSettings } from 'expo-linking';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShelfScanCapture } from '@/components/shelf-scan-capture';
import { GlassIconButton } from '@/components/ui/glass-icon-button';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { useBooks } from '@/lib/hooks';
import { selectScanViewState } from '@/lib/scan-capture';

/**
 * Scan modal host (#106): one view for shelf, cover and ISBN scanning. Owns camera
 * permission and the catalog-readiness gate (spine matching and barcode lookup both
 * run against the in-memory catalog), plus the close button.
 */
export default function ScanScreen() {
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const [permission, requestPermission] = useCameraPermissions();
	const isFocused = useIsFocused();
	const { books, error: catalogError, refetch } = useBooks();

	// Review owns its own navigation, so the close button hides while it's up.
	const [immersive, setImmersive] = useState(false);
	const onImmersiveChange = useCallback((next: boolean) => setImmersive(next), []);

	const view = selectScanViewState({
		permission,
		catalogReady: books.length > 0,
		catalogError,
	});

	// A full-screen modal has no swipe-to-dismiss, so this is the only way out.
	const closeButton = (
		<View style={[styles.closeSlot, { top: insets.top + 8 }]} pointerEvents="box-none">
			<GlassIconButton
				icon="xmark"
				accessibilityLabel="Close scanner"
				onPress={() => router.back()}
			/>
		</View>
	);

	if (view === 'scanning') {
		return (
			<View style={styles.container}>
				<ShelfScanCapture enabled={isFocused} onImmersiveChange={onImmersiveChange} />
				{!immersive && closeButton}
			</View>
		);
	}

	return (
		<View style={styles.center}>
			{view === 'checking_permission' && (
				<ActivityIndicator
					color={tokens.accent.primary}
					accessibilityLabel="Checking camera access"
				/>
			)}

			{(view === 'permission_prompt' || view === 'permission_denied') && (
				<>
					<Text style={styles.title} accessibilityRole="header">
						Camera Access Needed
					</Text>
					<Text style={styles.bodyText}>
						{view === 'permission_prompt'
							? 'OssusArchives needs camera access to scan books.'
							: 'Camera access was denied. Enable it in Settings to scan books.'}
					</Text>
					<Pressable
						style={styles.primaryButton}
						onPress={view === 'permission_prompt' ? requestPermission : () => openSettings()}
						accessibilityRole="button"
						accessibilityHint={
							view === 'permission_prompt'
								? 'Shows the camera permission prompt'
								: 'Opens Settings for OssusArchives'
						}
					>
						<Text style={styles.primaryButtonText}>
							{view === 'permission_prompt' ? 'Grant Access' : 'Open Settings'}
						</Text>
					</Pressable>
				</>
			)}

			{view === 'catalog_error' && (
				<>
					<Text style={styles.title} accessibilityRole="header">
						Couldn't load the Archive
					</Text>
					<Text style={styles.bodyText}>
						Scanning needs the book catalog. Check your connection and try again.
					</Text>
					<Pressable
						style={styles.primaryButton}
						onPress={refetch}
						accessibilityRole="button"
						accessibilityHint="Reloads the book catalog"
					>
						<Text style={styles.primaryButtonText}>Retry</Text>
					</Pressable>
				</>
			)}

			{view === 'catalog_loading' && (
				<>
					<ActivityIndicator
						color={tokens.accent.primary}
						accessibilityElementsHidden
						importantForAccessibility="no-hide-descendants"
					/>
					<Text style={styles.bodyText}>Loading the Archive…</Text>
				</>
			)}

			{closeButton}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		// True black for the camera frame (camera-overlay exception; matches the panels).
		backgroundColor: '#000',
	},
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 32,
		gap: 16,
		backgroundColor: '#000',
	},
	closeSlot: {
		position: 'absolute',
		left: 16,
	},
	title: {
		color: tokens.text.primary,
		fontSize: 20,
		fontWeight: '600',
		textAlign: 'center',
	},
	bodyText: {
		color: tokens.text.secondary,
		fontSize: 14,
		textAlign: 'center',
	},
	primaryButton: {
		marginTop: 8,
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: tokens.accent.primary,
	},
	primaryButtonText: {
		color: tokens.text.inverse,
		fontSize: 15,
		fontWeight: '600',
	},
});
