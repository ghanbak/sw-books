import { useIsFocused } from '@react-navigation/native';
import { CameraView } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AddedBooksSheet } from '@/components/added-books-sheet';
import { tokens } from '@/constants/tokens';
import { type Book, useUserBooks } from '@/lib/hooks';
import { normalizeIsbn } from '@/lib/isbn';
import { supabase } from '@/lib/supabase';

/**
 * Barcode scanning experience (plan Phase 5: extracted from scan.tsx so the screen
 * is a thin mode host). Stays on expo-camera's `CameraView`: VisionCamera v5's code
 * output is iOS-only and exposes no `useCodeScanner`, so migrating it would drop
 * Android barcode support. The two camera stacks never mount at once (the host
 * renders one panel at a time), so they don't contend for the hardware.
 *
 * Looks up each scanned ISBN against Supabase directly — this path does NOT need the
 * in-memory catalog, so it works even while the catalog is still loading. A found book
 * surfaces the AddedBooksSheet confirmation (add to library / view / scan another).
 */

type ScanResult =
	| { type: 'found'; book: Book }
	| { type: 'not_found'; isbn: string }
	| { type: 'invalid' }
	| { type: 'error' }
	| null;

const SCAN_COOLDOWN_MS = 2000;

export function BarcodeScanPanel() {
	const [result, setResult] = useState<ScanResult>(null);
	const [scanning, setScanning] = useState(false);
	const lastScanTime = useRef(0);
	// Drop async lookup results that land after the tab unmounts (native tabs unmount
	// blurred screens) — no setState on a dead component.
	const aliveRef = useRef(true);
	useEffect(() => {
		aliveRef.current = true;
		return () => {
			aliveRef.current = false;
		};
	}, []);
	const router = useRouter();
	const isFocused = useIsFocused();
	const { addOwned } = useUserBooks();

	const handleBarcodeScanned = useCallback(
		async ({ data }: { type: string; data: string }) => {
			// Debounce: ignore scans within the cooldown period.
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

			try {
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

				if (!aliveRef.current) return;
				if (books && books.length > 0) {
					setResult({ type: 'found', book: books[0] });
				} else {
					setResult({ type: 'not_found', isbn });
				}
			} catch (cause) {
				// A thrown lookup (network error) must surface a result and release the
				// scanner — otherwise `scanning` stays true and every later scan is blocked.
				if (__DEV__) console.warn('[Scanner] lookup threw:', cause);
				if (aliveRef.current) setResult({ type: 'error' });
			} finally {
				if (aliveRef.current) setScanning(false);
			}
		},
		[scanning],
	);

	const dismissResult = useCallback(() => {
		setResult(null);
		// Re-arm immediately: the cooldown was meant to debounce repeat frames of the
		// same code, not to deafen the scanner for 2s after an explicit "Scan Another".
		lastScanTime.current = 0;
	}, []);
	const goToBook = useCallback(
		(bookId: string) => {
			setResult(null);
			router.push(`/book/${bookId}`);
		},
		[router],
	);
	const addToLibrary = useCallback(
		async (book: Book) => {
			const res = await addOwned([book.id]);
			dismissResult();
			if (!res.ok) Alert.alert('Could not add to library', res.error.message);
		},
		[addOwned, dismissResult],
	);

	return (
		<View style={styles.container}>
			{/* Camera — unmount when the tab loses focus to release the hardware and battery. */}
			{isFocused && (
				<CameraView
					style={StyleSheet.absoluteFill}
					facing="back"
					barcodeScannerSettings={{ barcodeTypes: ['ean13', 'upc_a'] }}
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

			{/* Found → confirmation sheet over the camera */}
			{result?.type === 'found' && (
				<AddedBooksSheet
					title="1 book found"
					books={[result.book]}
					onSelectBook={goToBook}
					onDismiss={dismissResult}
					onConfirm={() => addToLibrary(result.book)}
				/>
			)}

			{/* Other results → centered message */}
			{result && result.type !== 'found' && (
				<Animated.View
					style={styles.resultOverlay}
					entering={FadeIn.duration(200)}
					exiting={FadeOut.duration(200)}
				>
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

					{result.type === 'error' && (
						<View style={styles.resultMessage}>
							<Text style={styles.messageTitle}>Lookup Failed</Text>
							<Text style={styles.messageText}>
								Couldn't reach the Archive. Check your connection and try again.
							</Text>
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
		// and reads slightly off against the camera feed (camera-overlay exception).
		backgroundColor: '#000',
	},
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
	resultOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: tokens.surface.overlay,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24,
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
