import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCameraPermissions } from 'expo-camera';
import { openSettings } from 'expo-linking';
import { useRouter } from 'expo-router';
import { useIsFocused } from 'expo-router/react-navigation';
import { X } from 'lucide-react-native';
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarcodeScanPanel } from '@/components/barcode-scan-panel';
import { ScanModeSwitcher } from '@/components/scan-mode-switcher';
import { ShelfScanCapture } from '@/components/shelf-scan-capture';
import { GlassIconButton } from '@/components/ui/glass-icon-button';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { useBooks } from '@/lib/hooks';
import { type ScanMode, parseStoredScanMode } from '@/lib/scan-mode';

const SCAN_MODE_KEY = '@ossus/scan_mode';

/**
 * Scan-tab host (plan Phase 5). Owns camera permission, the persisted Barcode/Shelf
 * mode, the catalog-readiness edge states that gate shelf matching, and the floating
 * mode switcher (hidden while the shelf review overlay owns the screen). The two
 * camera experiences live in their own panels — only one mounts at a time.
 */
export default function ScanScreen() {
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const [permission, requestPermission] = useCameraPermissions();
	const isFocused = useIsFocused();
	const { books, error: catalogError, refetch } = useBooks();

	// null until the persisted mode hydrates — avoids flashing the wrong panel.
	const [mode, setMode] = useState<ScanMode | null>(null);
	useEffect(() => {
		let alive = true;
		AsyncStorage.getItem(SCAN_MODE_KEY)
			.then((raw) => {
				if (alive) setMode(parseStoredScanMode(raw));
			})
			.catch(() => {
				if (alive) setMode(parseStoredScanMode(null));
			});
		return () => {
			alive = false;
		};
	}, []);

	// Shelf chrome from the capture child: `immersive` (hide the switcher) as state since
	// a one-frame lag is invisible; `dirty` (a switch would discard captures) as a ref so
	// the confirm reads a value that can't lag the just-landed capture.
	const [shelfImmersive, setShelfImmersive] = useState(false);
	const onShelfImmersive = useCallback((immersive: boolean) => setShelfImmersive(immersive), []);
	const shelfDirtyRef = useRef(false);
	// Re-entrancy guard: a double-tap on the switcher must not stack two confirm dialogs.
	const switchPendingRef = useRef(false);

	const switchMode = useCallback(
		(next: ScanMode) => {
			if (next === mode || switchPendingRef.current) return;
			const commit = () => {
				setShelfImmersive(false);
				shelfDirtyRef.current = false;
				setMode(next);
				AsyncStorage.setItem(SCAN_MODE_KEY, next).catch(() => {});
			};
			// Leaving shelf mid-scan throws away captured photos that were never saved.
			// (A published review draft only exists in immersive phases, where the
			// switcher is hidden — so a switch we actually allow never strands a draft.)
			if (mode === 'shelf' && next === 'barcode' && shelfDirtyRef.current) {
				switchPendingRef.current = true;
				const done = () => {
					switchPendingRef.current = false;
				};
				Alert.alert(
					'Discard this scan?',
					"Your captured photos haven't been added to your shelf yet.",
					[
						{ text: 'Keep scanning', style: 'cancel', onPress: done },
						{
							text: 'Discard',
							style: 'destructive',
							onPress: () => {
								commit();
								done();
							},
						},
					],
					{ onDismiss: done },
				);
				return;
			}
			commit();
		},
		[mode],
	);

	// A full-screen modal has no swipe-to-dismiss, so this close button is the only way out.
	// Rendered in every state; top-left so it never overlaps the centered mode switcher.
	const closeButton = (
		<View style={[styles.closeSlot, { top: insets.top + 8 }]} pointerEvents="box-none">
			<GlassIconButton icon={X} accessibilityLabel="Close scanner" onPress={() => router.back()} />
		</View>
	);

	// Permission not yet determined
	if (!permission) {
		return (
			<View style={styles.center}>
				<ActivityIndicator color={tokens.accent.primary} />
				{closeButton}
			</View>
		);
	}

	// Permission denied
	if (!permission.granted) {
		const canAsk = permission.canAskAgain;
		return (
			<View style={styles.center}>
				<Text style={styles.title}>Camera Access Needed</Text>
				<Text style={styles.bodyText}>
					{canAsk
						? 'OssusArchives needs camera access to scan books.'
						: 'Camera access was denied. Enable it in Settings to scan books.'}
				</Text>
				<Pressable
					style={styles.primaryButton}
					onPress={canAsk ? requestPermission : () => openSettings()}
					accessibilityRole="button"
				>
					<Text style={styles.primaryButtonText}>{canAsk ? 'Grant Access' : 'Open Settings'}</Text>
				</Pressable>
				{closeButton}
			</View>
		);
	}

	// Persisted mode still hydrating — brief, on the same black canvas as the camera.
	if (mode === null) {
		return <View style={styles.container}>{closeButton}</View>;
	}

	// Switcher hides only while the shelf review overlay owns the screen (it has its
	// own navigation; switching there is the destructive case handled via Start Over).
	const showSwitcher = !(mode === 'shelf' && shelfImmersive);

	return (
		<View style={styles.container}>
			{mode === 'barcode' ? (
				<BarcodeScanPanel />
			) : (
				<ShelfModePanel
					focused={isFocused}
					catalogReady={books.length > 0}
					catalogError={catalogError}
					onRetry={refetch}
					onImmersiveChange={onShelfImmersive}
					dirtyRef={shelfDirtyRef}
				/>
			)}

			{showSwitcher && (
				<View style={[styles.switcherSlot, { top: insets.top + 8 }]} pointerEvents="box-none">
					<ScanModeSwitcher mode={mode} onSwitch={switchMode} />
				</View>
			)}

			{/* Close hides during the immersive shelf review (it owns its own navigation). */}
			{showSwitcher && closeButton}
		</View>
	);
}

/**
 * Shelf mode with its catalog-readiness gate: the matcher needs the full catalog in
 * memory, so capture only mounts once it has loaded. Loading and load-failure are
 * explicit states (replacing the Phase 3 `books.length > 0` interim gate) — and both
 * keep the mode switcher reachable so the user can fall back to barcode.
 */
function ShelfModePanel({
	focused,
	catalogReady,
	catalogError,
	onRetry,
	onImmersiveChange,
	dirtyRef,
}: {
	focused: boolean;
	catalogReady: boolean;
	catalogError: string | null;
	onRetry: () => void;
	onImmersiveChange: (immersive: boolean) => void;
	dirtyRef: MutableRefObject<boolean>;
}) {
	// The loading/error states have no captures, so report non-immersive + clean: the
	// host shows the switcher and never guards a switch that would lose nothing.
	useEffect(() => {
		if (!catalogReady) {
			onImmersiveChange(false);
			dirtyRef.current = false;
		}
	}, [catalogReady, onImmersiveChange, dirtyRef]);

	if (catalogReady) {
		return (
			<ShelfScanCapture
				enabled={focused}
				onImmersiveChange={onImmersiveChange}
				dirtyRef={dirtyRef}
			/>
		);
	}

	if (catalogError) {
		return (
			<View style={styles.center}>
				<Text style={styles.title}>Couldn't load the Archive</Text>
				<Text style={styles.bodyText}>
					Shelf scanning needs the book catalog. Check your connection and try again.
				</Text>
				<Pressable style={styles.primaryButton} onPress={onRetry} accessibilityRole="button">
					<Text style={styles.primaryButtonText}>Retry</Text>
				</Pressable>
			</View>
		);
	}

	// Loading (or an empty catalog that's still settling).
	return (
		<View style={styles.center}>
			<ActivityIndicator color={tokens.accent.primary} />
			<Text style={styles.bodyText}>Loading the Archive…</Text>
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
	switcherSlot: {
		position: 'absolute',
		left: 0,
		right: 0,
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
		color: tokens.text.primary,
		fontSize: 15,
		fontWeight: '600',
	},
});
