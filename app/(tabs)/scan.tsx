import { useIsFocused } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { openSettings } from 'expo-linking';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Book3D } from '@/components/Book3D';
import { ShelfScanCapture } from '@/components/shelf-scan-capture';
import { tokens } from '@/constants/tokens';
import { type Book, useBooks } from '@/lib/hooks';
import { normalizeIsbn } from '@/lib/isbn';
import { supabase } from '@/lib/supabase';

type ScanResult =
	| { type: 'found'; book: Book }
	| { type: 'not_found'; isbn: string }
	| { type: 'invalid' }
	| null;

const SCAN_COOLDOWN_MS = 2000;

export default function ScanScreen() {
	const [permission, requestPermission] = useCameraPermissions();
	const [result, setResult] = useState<ScanResult>(null);
	const [scanning, setScanning] = useState(false);
	// Temporary mode switch — Phase 5 replaces this with the real mode host
	// (shelf default + first-run dialogue + barcode on useCodeScanner).
	const [mode, setMode] = useState<'barcode' | 'shelf'>('barcode');
	// Shelf matching needs the catalog in memory — don't offer the mode until it's
	// loaded (Phase 5 wires the full catalog-loading/failed edge states).
	const { books } = useBooks();
	const shelfModeReady = books.length > 0;
	const lastScanTime = useRef(0);
	const router = useRouter();
	const isFocused = useIsFocused();

	const handleBarcodeScanned = useCallback(
		async ({ data }: { type: string; data: string }) => {
			// Debounce: ignore scans within cooldown period
			const now = Date.now();
			if (now - lastScanTime.current < SCAN_COOLDOWN_MS) return;
			if (scanning) return;

			lastScanTime.current = now;
			setScanning(true);

			const isbn = normalizeIsbn(data);
			if (__DEV__) {
				console.log(`[Scanner] Raw: "${data}" → Normalized: "${isbn}"`);
			}
			if (!isbn) {
				setResult({ type: 'invalid' });
				setScanning(false);
				return;
			}

			const { data: books, error } = await supabase
				.from('books')
				.select('*')
				.contains('isbn', [isbn])
				.limit(1);

			if (__DEV__) {
				console.log(
					`[Scanner] Query isbn=${isbn}, found=${books?.length ?? 0}, error=${error?.message ?? 'none'}`,
				);
			}

			if (books && books.length > 0) {
				setResult({ type: 'found', book: books[0] });
			} else {
				setResult({ type: 'not_found', isbn });
			}
			setScanning(false);
		},
		[scanning],
	);

	const dismissResult = useCallback(() => {
		setResult(null);
	}, []);

	const goToBook = useCallback(
		(bookId: string) => {
			setResult(null);
			router.push(`/book/${bookId}`);
		},
		[router],
	);

	// Permission not yet determined
	if (!permission) {
		return (
			<View style={styles.center}>
				<Text>Loading camera...</Text>
			</View>
		);
	}

	// Permission denied
	if (!permission.granted) {
		const canAsk = permission.canAskAgain;
		return (
			<View style={styles.center}>
				<Text style={styles.permissionTitle}>Camera Access Needed</Text>
				<Text style={styles.permissionText}>
					{canAsk
						? 'OssusArchives needs camera access to scan book barcodes.'
						: 'Camera access was denied. Enable it in Settings to scan barcodes.'}
				</Text>
				<Pressable
					style={styles.permissionButton}
					onPress={canAsk ? requestPermission : () => openSettings()}
				>
					<Text style={styles.permissionButtonText}>
						{canAsk ? 'Grant Access' : 'Open Settings'}
					</Text>
				</Pressable>
			</View>
		);
	}

	// Shelf mode: VisionCamera capture experience (one camera stack at a time —
	// the barcode CameraView below stays unmounted while this renders).
	if (mode === 'shelf') {
		return (
			<View style={styles.container}>
				<ShelfScanCapture enabled={isFocused} />
				<Pressable
					style={styles.modeToggle}
					onPress={() => setMode('barcode')}
					accessibilityRole="button"
					accessibilityLabel="Switch to barcode scanning"
				>
					<Text style={styles.modeToggleText}>Barcode</Text>
				</Pressable>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			{/* Camera — unmount when tab loses focus to release the hardware and battery */}
			{isFocused && (
				<CameraView
					style={StyleSheet.absoluteFill}
					facing="back"
					barcodeScannerSettings={{
						barcodeTypes: ['ean13', 'upc_a'],
					}}
					onBarcodeScanned={result ? undefined : handleBarcodeScanned}
				/>
			)}

			{/* Viewfinder overlay */}
			<View style={styles.viewfinder}>
				<View style={styles.viewfinderTop} />
				<View style={styles.viewfinderMiddle}>
					<View style={styles.viewfinderSide} />
					<View style={styles.viewfinderTarget}>
						<View style={[styles.corner, styles.cornerTL]} />
						<View style={[styles.corner, styles.cornerTR]} />
						<View style={[styles.corner, styles.cornerBL]} />
						<View style={[styles.corner, styles.cornerBR]} />
					</View>
					<View style={styles.viewfinderSide} />
				</View>
				<View style={styles.viewfinderBottom}>
					<Text style={styles.viewfinderHint}>
						{scanning ? 'Looking up...' : 'Point at a book barcode'}
					</Text>
				</View>
			</View>

			{shelfModeReady && (
				<Pressable
					style={styles.modeToggle}
					onPress={() => setMode('shelf')}
					accessibilityRole="button"
					accessibilityLabel="Switch to shelf scanning"
				>
					<Text style={styles.modeToggleText}>Shelf (beta)</Text>
				</Pressable>
			)}

			{/* Result overlay */}
			{result && (
				<Animated.View
					style={styles.resultOverlay}
					entering={FadeIn.duration(200)}
					exiting={FadeOut.duration(200)}
				>
					{result.type === 'found' && (
						<View style={styles.resultCard}>
							<Book3D
								coverUri={result.book.cover_image}
								title={result.book.title}
								author={result.book.author}
								width={100}
								height={150}
								accessibilityLabel={`Found: ${result.book.title}`}
							/>
							<View style={styles.resultInfo}>
								<Text style={styles.resultTitle} numberOfLines={2}>
									{result.book.title}
								</Text>
								<Text style={styles.resultAuthor} numberOfLines={1}>
									{result.book.author.join(', ')}
								</Text>
								<Pressable style={styles.resultButton} onPress={() => goToBook(result.book.id)}>
									<Text style={styles.resultButtonText}>View Book</Text>
								</Pressable>
							</View>
						</View>
					)}

					{result.type === 'not_found' && (
						<View style={styles.resultMessage}>
							<Text style={styles.messageTitle}>Not in the Archive</Text>
							<Text style={styles.messageText}>
								If an item does not appear in our records, it does not exist!
							</Text>
							<Text style={styles.messageIsbn}>ISBN: {result.isbn}</Text>
						</View>
					)}

					{result.type === 'invalid' && (
						<View style={styles.resultMessage}>
							<Text style={styles.messageTitle}>Invalid Barcode</Text>
							<Text style={styles.messageText}>Couldn't read a valid ISBN from that barcode.</Text>
						</View>
					)}

					<Pressable style={styles.dismissButton} onPress={dismissResult}>
						<Text style={styles.dismissText}>Scan Another</Text>
					</Pressable>
				</Animated.View>
			)}
		</View>
	);
}

// Scanner-specialized: lighter than tokens.surface.overlay so the camera feed
// remains partially visible behind the viewfinder mask.
const OVERLAY_COLOR = 'rgba(0,0,0,0.55)';
const CORNER_SIZE = 24;
const CORNER_WIDTH = 3;

const styles = StyleSheet.create({
	container: {
		flex: 1,
		// True black for the camera frame — tokens.surface.background is near-black
		// and reads slightly off against the camera feed.
		backgroundColor: '#000',
	},
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 32,
		backgroundColor: '#000',
	},
	permissionTitle: {
		color: tokens.text.primary,
		fontSize: 20,
		fontWeight: '600',
		marginBottom: 8,
	},
	permissionText: {
		color: tokens.text.secondary,
		fontSize: 14,
		textAlign: 'center',
		marginBottom: 24,
	},
	permissionButton: {
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: tokens.accent.secondary,
	},
	permissionButtonText: {
		// True black for max contrast on yellow.
		color: '#000',
		fontSize: 15,
		fontWeight: '600',
	},
	// Viewfinder overlay
	viewfinder: {
		...StyleSheet.absoluteFillObject,
	},
	viewfinderTop: {
		flex: 1,
		backgroundColor: OVERLAY_COLOR,
	},
	viewfinderMiddle: {
		flexDirection: 'row',
		height: 200,
	},
	viewfinderSide: {
		flex: 1,
		backgroundColor: OVERLAY_COLOR,
	},
	viewfinderTarget: {
		width: 260,
		height: 200,
	},
	viewfinderBottom: {
		flex: 1.5,
		backgroundColor: OVERLAY_COLOR,
		alignItems: 'center',
		paddingTop: 24,
	},
	viewfinderHint: {
		color: tokens.text.primary,
		fontSize: 14,
		opacity: 0.8,
	},
	// Corner brackets
	corner: {
		position: 'absolute',
		width: CORNER_SIZE,
		height: CORNER_SIZE,
	},
	cornerTL: {
		top: 0,
		left: 0,
		borderTopWidth: CORNER_WIDTH,
		borderLeftWidth: CORNER_WIDTH,
		borderColor: tokens.accent.secondary,
	},
	cornerTR: {
		top: 0,
		right: 0,
		borderTopWidth: CORNER_WIDTH,
		borderRightWidth: CORNER_WIDTH,
		borderColor: tokens.accent.secondary,
	},
	cornerBL: {
		bottom: 0,
		left: 0,
		borderBottomWidth: CORNER_WIDTH,
		borderLeftWidth: CORNER_WIDTH,
		borderColor: tokens.accent.secondary,
	},
	cornerBR: {
		bottom: 0,
		right: 0,
		borderBottomWidth: CORNER_WIDTH,
		borderRightWidth: CORNER_WIDTH,
		borderColor: tokens.accent.secondary,
	},
	// Temporary mode toggle (replaced by the Phase 5 mode host)
	modeToggle: {
		position: 'absolute',
		top: 64,
		right: 16,
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 16,
		backgroundColor: 'rgba(0,0,0,0.55)',
		borderWidth: 1,
		borderColor: tokens.border.subtle,
	},
	modeToggleText: {
		color: tokens.accent.secondary,
		fontSize: 13,
		fontWeight: '600',
	},
	// Result overlay
	resultOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: tokens.surface.overlay,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24,
	},
	resultCard: {
		flexDirection: 'row',
		backgroundColor: tokens.surface.card,
		borderRadius: 12,
		padding: 16,
		gap: 16,
		width: '100%',
		maxWidth: 360,
		alignItems: 'center',
	},
	resultInfo: {
		flex: 1,
		gap: 6,
	},
	resultTitle: {
		color: tokens.text.primary,
		fontSize: 17,
		fontWeight: '600',
	},
	resultAuthor: {
		color: tokens.text.secondary,
		fontSize: 13,
	},
	resultButton: {
		marginTop: 8,
		paddingVertical: 10,
		paddingHorizontal: 16,
		borderRadius: 8,
		backgroundColor: tokens.accent.secondary,
		alignSelf: 'flex-start',
	},
	resultButtonText: {
		// True black for max contrast on yellow.
		color: '#000',
		fontSize: 14,
		fontWeight: '600',
	},
	resultMessage: {
		alignItems: 'center',
		gap: 8,
	},
	messageTitle: {
		color: tokens.text.primary,
		fontSize: 20,
		fontWeight: '600',
	},
	messageText: {
		color: tokens.text.secondary,
		fontSize: 14,
		textAlign: 'center',
	},
	messageIsbn: {
		color: tokens.text.hint,
		fontSize: 12,
		fontFamily: 'monospace',
		marginTop: 8,
	},
	dismissButton: {
		marginTop: 24,
		paddingVertical: 12,
		paddingHorizontal: 24,
		borderRadius: 8,
		backgroundColor: 'rgba(255,255,255,0.12)',
	},
	dismissText: {
		color: tokens.text.primary,
		fontSize: 14,
		fontWeight: '500',
	},
});
