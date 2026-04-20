import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Book3D } from '@/components/Book3D';
import { tokens } from '@/constants/tokens';
import type { Book } from '@/lib/hooks';
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
	const lastScanTime = useRef(0);
	const router = useRouter();

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
				console.log(`[Scanner] Query isbn=${isbn}, found=${books?.length ?? 0}, error=${error?.message ?? 'none'}`);
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
		return (
			<View style={styles.center}>
				<Text style={styles.permissionTitle}>Camera Access Needed</Text>
				<Text style={styles.permissionText}>
					SW Books needs camera access to scan book barcodes.
				</Text>
				<Pressable style={styles.permissionButton} onPress={requestPermission}>
					<Text style={styles.permissionButtonText}>Grant Access</Text>
				</Pressable>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			{/* Camera */}
			<CameraView
				style={StyleSheet.absoluteFill}
				facing="back"
				barcodeScannerSettings={{
					barcodeTypes: ['ean13', 'upc_a'],
				}}
				onBarcodeScanned={result ? undefined : handleBarcodeScanned}
			/>

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
								<Pressable
									style={styles.resultButton}
									onPress={() => goToBook(result.book.id)}
								>
									<Text style={styles.resultButtonText}>View Book</Text>
								</Pressable>
							</View>
						</View>
					)}

					{result.type === 'not_found' && (
						<View style={styles.resultMessage}>
							<Text style={styles.messageTitle}>Not in Catalog</Text>
							<Text style={styles.messageText}>
								This book isn't in our catalog yet.
							</Text>
							<Text style={styles.messageIsbn}>ISBN: {result.isbn}</Text>
						</View>
					)}

					{result.type === 'invalid' && (
						<View style={styles.resultMessage}>
							<Text style={styles.messageTitle}>Invalid Barcode</Text>
							<Text style={styles.messageText}>
								Couldn't read a valid ISBN from that barcode.
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

const OVERLAY_COLOR = 'rgba(0,0,0,0.55)';
const CORNER_SIZE = 24;
const CORNER_WIDTH = 3;
const ACCENT = '#FFE81F'; // Star Wars yellow

const styles = StyleSheet.create({
	container: {
		flex: 1,
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
		color: '#fff',
		fontSize: 20,
		fontWeight: '600',
		marginBottom: 8,
	},
	permissionText: {
		color: 'rgba(255,255,255,0.6)',
		fontSize: 14,
		textAlign: 'center',
		marginBottom: 24,
	},
	permissionButton: {
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: ACCENT,
	},
	permissionButtonText: {
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
		color: '#fff',
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
		borderColor: ACCENT,
	},
	cornerTR: {
		top: 0,
		right: 0,
		borderTopWidth: CORNER_WIDTH,
		borderRightWidth: CORNER_WIDTH,
		borderColor: ACCENT,
	},
	cornerBL: {
		bottom: 0,
		left: 0,
		borderBottomWidth: CORNER_WIDTH,
		borderLeftWidth: CORNER_WIDTH,
		borderColor: ACCENT,
	},
	cornerBR: {
		bottom: 0,
		right: 0,
		borderBottomWidth: CORNER_WIDTH,
		borderRightWidth: CORNER_WIDTH,
		borderColor: ACCENT,
	},
	// Result overlay
	resultOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'rgba(0,0,0,0.85)',
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
		color: '#fff',
		fontSize: 17,
		fontWeight: '600',
	},
	resultAuthor: {
		color: 'rgba(255,255,255,0.6)',
		fontSize: 13,
	},
	resultButton: {
		marginTop: 8,
		paddingVertical: 10,
		paddingHorizontal: 16,
		borderRadius: 8,
		backgroundColor: ACCENT,
		alignSelf: 'flex-start',
	},
	resultButtonText: {
		color: '#000',
		fontSize: 14,
		fontWeight: '600',
	},
	resultMessage: {
		alignItems: 'center',
		gap: 8,
	},
	messageTitle: {
		color: '#fff',
		fontSize: 20,
		fontWeight: '600',
	},
	messageText: {
		color: 'rgba(255,255,255,0.6)',
		fontSize: 14,
		textAlign: 'center',
	},
	messageIsbn: {
		color: 'rgba(255,255,255,0.3)',
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
		color: '#fff',
		fontSize: 14,
		fontWeight: '500',
	},
});
