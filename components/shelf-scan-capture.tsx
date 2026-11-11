import AsyncStorage from '@react-native-async-storage/async-storage';
import { type BarcodeScanningResult, CameraView } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
	FadeIn,
	FadeOut,
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withSpring,
	withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Swap to '@/components/scan-tray' once #75 lands on the feature branch.
import { ScanTray } from '@/components/scan-tray-placeholder';
import { ShelfScanQueued } from '@/components/shelf-scan-queued';
import { ShelfScanReview } from '@/components/shelf-scan-review';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { announce, useReduceMotion, useScreenReaderEnabled } from '@/hooks/useAccessibility';
import { useShelfScan } from '@/hooks/useShelfScan';
import { GlassView, liquidGlassAvailable } from '@/lib/glass';
import { photosCapturedLabel, shelfIntroCopy } from '@/lib/scan-a11y';
import { finishCapturedLabel } from '@/lib/scan-capture';
import { deriveShelfChrome } from '@/lib/shelf-scan';

const INTRO_SEEN_KEY = '@ossus/scan_intro_seen';

/** A barcode result that takes over the screen until dismissed (the old ISBN view's errors). */
type BarcodeNotice = { type: 'not_star_wars'; isbn: string } | { type: 'invalid' } | null;

/**
 * The unified scan view (#106): one camera that auto-captures shelf/cover stills for
 * OCR and reads ISBN barcodes at the same time. Every recognized book prepends to the
 * tray above the Finish button; Finish hands the tray (plus the final match pass) to
 * the existing review step. Screen-reader users keep the manual shutter, since the
 * auto-capture steadiness gate needs sight of the framing.
 *
 * @param enabled screen focus (+ permission and catalog, gated by the host).
 * @param onImmersiveChange notifies the host when review takes/leaves the screen (it
 *   hides the close button, since review owns its own navigation).
 */
export function ShelfScanCapture({
	enabled,
	onImmersiveChange,
}: {
	enabled: boolean;
	onImmersiveChange?: (immersive: boolean) => void;
}) {
	const insets = useSafeAreaInsets();
	const reduceMotion = useReduceMotion();
	const screenReaderEnabled = useScreenReaderEnabled();
	// null = still reading the flag; false = show intro; true = seen.
	const [introSeen, setIntroSeen] = useState<boolean | null>(null);
	useEffect(() => {
		let alive = true;
		AsyncStorage.getItem(INTRO_SEEN_KEY)
			.then((raw) => {
				if (alive) setIntroSeen(raw === '1');
			})
			.catch(() => {
				if (alive) setIntroSeen(false);
			});
		return () => {
			alive = false;
		};
	}, []);

	const [barcodeNotice, setBarcodeNotice] = useState<BarcodeNotice>(null);

	// Camera + sensors run only once the intro is dismissed, so auto-capture can't
	// fire behind the modal. A barcode notice pauses auto-capture but keeps the feed.
	const active = enabled && introSeen === true;
	const scan = useShelfScan({
		enabled: active && barcodeNotice === null,
		manualOnly: screenReaderEnabled,
	});
	const { phase } = scan.state;
	const showCamera = active && (phase === 'capturing' || phase === 'interrupted');
	const bookCount = scan.captured.length;

	const { immersive } = deriveShelfChrome(phase, scan.captureCount);
	useEffect(() => {
		onImmersiveChange?.(immersive);
	}, [onImmersiveChange, immersive]);

	// Screen-reader narration of the otherwise-silent flow.
	const announcedCountRef = useRef(0);
	useEffect(() => {
		if (scan.captureCount > announcedCountRef.current) {
			announce(photosCapturedLabel(scan.captureCount));
		}
		announcedCountRef.current = scan.captureCount;
	}, [scan.captureCount]);
	const newestTitle = scan.captured[0]?.title;
	const announcedBooksRef = useRef(0);
	useEffect(() => {
		if (bookCount > announcedBooksRef.current && newestTitle) announce(`Added ${newestTitle}`);
		announcedBooksRef.current = bookCount;
	}, [bookCount, newestTitle]);
	useEffect(() => {
		if (phase === 'processing') announce('Matching against the Archive.');
		else if (phase === 'empty') announce('No books recognized. Keep scanning or start over.');
	}, [phase]);
	useEffect(() => {
		if (scan.captureError) announce(scan.captureError);
	}, [scan.captureError]);

	const { scanBarcode, rearmBarcode } = scan;
	const onBarcodeScanned = useCallback(
		({ data }: BarcodeScanningResult) => {
			const outcome = scanBarcode(data);
			if (!outcome) return;
			if (outcome.type === 'duplicate') announce(`${outcome.book.title} is already captured`);
			else if (outcome.type === 'not_star_wars' || outcome.type === 'invalid') {
				setBarcodeNotice(outcome);
				announce(outcome.type === 'invalid' ? 'Invalid barcode' : 'Not in the Archive');
			}
		},
		[scanBarcode],
	);
	const dismissNotice = useCallback(() => {
		setBarcodeNotice(null);
		rearmBarcode();
	}, [rearmBarcode]);

	const dismissIntro = useCallback(() => {
		setIntroSeen(true);
		AsyncStorage.setItem(INTRO_SEEN_KEY, '1').catch((cause) => {
			if (__DEV__) console.warn('[shelf-scan] intro flag write failed:', cause);
		});
	}, []);

	// First run: explain the scan model before the camera starts. Gated on
	// `phase === 'capturing'` so a session resumed straight into Review skips it.
	if (enabled && introSeen === false && phase === 'capturing') {
		return (
			<View style={styles.container}>
				<ShelfIntro
					onDismiss={dismissIntro}
					topInset={insets.top}
					screenReaderEnabled={screenReaderEnabled}
				/>
			</View>
		);
	}

	const canFinish = bookCount > 0 || scan.captureCount > 0;

	return (
		<View style={styles.container}>
			{showCamera && (
				<CameraView
					ref={scan.setCameraRef}
					style={StyleSheet.absoluteFill}
					facing="back"
					onCameraReady={scan.onCameraReady}
					barcodeScannerSettings={{ barcodeTypes: ['ean13', 'upc_a'] }}
					onBarcodeScanned={
						phase === 'capturing' && barcodeNotice === null ? onBarcodeScanned : undefined
					}
				/>
			)}

			{/* Reduce-motion: no flash at all — gated here so the component has no early
			    return after its hooks. */}
			{showCamera && !reduceMotion && <CaptureFlash captureCount={scan.captureCount} />}

			{/* HUD only while actually capturing — during Interrupted the controls would
			    render alive but dead (the reducer ignores them). */}
			{showCamera && phase === 'capturing' && barcodeNotice === null && (
				<View style={styles.hud} pointerEvents="box-none">
					<View style={[styles.hudTop, { paddingTop: insets.top + 60 }]}>
						<Text style={styles.hint}>
							{scan.atCap
								? 'Photo limit reached. Scan barcodes or tap Finish.'
								: screenReaderEnabled
									? // Auto-capture relies on seeing the framing; point the screen-reader
										// path at the manual shutter instead.
										'Point at a shelf section and double-tap Take photo, or point at a barcode. Tap Finish when done.'
									: 'Pan slowly across your shelf, or point at a book’s barcode'}
						</Text>
						{scan.captureCount > 0 && (
							<CaptureCounter count={scan.captureCount} reduceMotion={reduceMotion} />
						)}
					</View>

					{scan.captureError && (
						<Animated.View style={styles.errorBanner} entering={FadeIn.duration(200)}>
							<Text style={styles.errorBannerText}>{scan.captureError}</Text>
						</Animated.View>
					)}

					<View style={[styles.hudBottom, { paddingBottom: insets.bottom + 16 }]}>
						<ScanTray books={scan.captured} />
						{screenReaderEnabled && (
							<Pressable
								style={styles.shutter}
								onPress={scan.captureNow}
								disabled={scan.atCap}
								accessibilityRole="button"
								accessibilityLabel="Take photo"
								accessibilityHint={
									scan.atCap ? 'Photo limit reached' : 'Captures a photo of your shelf now'
								}
								accessibilityState={{ disabled: scan.atCap }}
							>
								<View style={[styles.shutterInner, scan.atCap && styles.shutterDisabled]} />
							</Pressable>
						)}
						{canFinish && (
							<Pressable
								style={({ pressed }) => [styles.finishShape, pressed && styles.pressed]}
								onPress={scan.finish}
								accessibilityRole="button"
								accessibilityLabel={finishCapturedLabel(bookCount)}
								accessibilityHint="Opens review to add these books to your library"
							>
								{liquidGlassAvailable ? (
									<GlassView
										style={[StyleSheet.absoluteFill, styles.finishGlass]}
										tintColor={tokens.accent.primary}
										isInteractive
									/>
								) : (
									<View style={[StyleSheet.absoluteFill, styles.finishButton]} />
								)}
								<Text style={liquidGlassAvailable ? styles.finishGlassText : styles.finishText}>
									Finish
								</Text>
							</Pressable>
						)}
					</View>
				</View>
			)}

			{phase === 'interrupted' && (
				<Animated.View style={styles.banner} entering={FadeIn.duration(200)}>
					<Text style={styles.bannerText}>Paused — your scan is saved</Text>
				</Animated.View>
			)}

			{/* The old ISBN view's error states, kept: a barcode outside the catalog. */}
			{showCamera && barcodeNotice && (
				<Animated.View
					style={styles.stateOverlay}
					entering={FadeIn.duration(200)}
					exiting={FadeOut.duration(200)}
				>
					{barcodeNotice.type === 'not_star_wars' ? (
						<>
							<Text style={styles.stateTitle} accessibilityRole="header">
								Not in the Archive
							</Text>
							<Text style={styles.stateText}>
								If an item does not appear in our records, it does not exist!
							</Text>
							<Text style={styles.stateIsbn} selectable>
								ISBN: {barcodeNotice.isbn}
							</Text>
						</>
					) : (
						<>
							<Text style={styles.stateTitle} accessibilityRole="header">
								Invalid Barcode
							</Text>
							<Text style={styles.stateText}>Couldn't read a valid ISBN from that barcode.</Text>
						</>
					)}
					<Pressable
						style={styles.dismissButton}
						onPress={dismissNotice}
						accessibilityRole="button"
						accessibilityHint="Returns to the scanner. Your captured books are kept."
					>
						<Text style={styles.secondaryButtonText}>Scan Another</Text>
					</Pressable>
				</Animated.View>
			)}

			{phase === 'processing' && (
				<Animated.View
					style={styles.stateOverlay}
					entering={FadeIn.duration(200)}
					exiting={FadeOut.duration(200)}
				>
					<ActivityIndicator
						size="large"
						color={tokens.accent.secondary}
						accessibilityElementsHidden
						importantForAccessibility="no-hide-descendants"
					/>
					<Text style={styles.stateTitle} accessibilityRole="header">
						Reading spines…
					</Text>
					<Text style={styles.stateText}>Matching against the Archive</Text>
				</Animated.View>
			)}

			{phase === 'empty' && (
				<Animated.View
					style={styles.stateOverlay}
					entering={FadeIn.duration(200)}
					exiting={FadeOut.duration(200)}
				>
					<Text style={styles.stateTitle} accessibilityRole="header">
						No books recognized
					</Text>
					<Text style={styles.stateText}>
						Get closer so spine text fills more of the frame, check the lighting, and hold steady on
						each section. A book may also not be in the Archive yet. Try its ISBN barcode.
					</Text>
					<Pressable
						style={styles.primaryButton}
						onPress={scan.keepScanning}
						accessibilityRole="button"
						accessibilityHint="Returns to the camera. Your photos are kept."
					>
						<Text style={styles.primaryButtonText}>Keep Scanning</Text>
					</Pressable>
					<Pressable
						style={styles.secondaryButton}
						onPress={scan.reset}
						accessibilityRole="button"
						accessibilityHint="Discards the photos from this scan"
					>
						<Text style={styles.secondaryButtonText}>Start Over</Text>
					</Pressable>
				</Animated.View>
			)}

			{(phase === 'review' || phase === 'adding' || phase === 'done') && (
				<ShelfScanReview
					phase={phase}
					addError={scan.addError}
					addedCount={scan.addedCount}
					onAdd={scan.addSelected}
					onReset={scan.reset}
				/>
			)}

			{phase === 'queued' && <ShelfScanQueued count={scan.queuedCount} onReset={scan.reset} />}
		</View>
	);
}

/**
 * One-time explainer for the silent auto-capture model (plan Phase 5 first-run).
 * Renders before the camera starts so panning instructions land before the first
 * photo, not after. Screen-reader users get the manual-shutter copy instead, since
 * `useShelfScan` runs `manualOnly` for them.
 */
function ShelfIntro({
	onDismiss,
	topInset,
	screenReaderEnabled,
}: {
	onDismiss: () => void;
	topInset: number;
	screenReaderEnabled: boolean;
}) {
	const [howTo, finishNote] = shelfIntroCopy(screenReaderEnabled);
	return (
		<Animated.View
			style={[styles.introOverlay, { paddingTop: topInset + 24 }]}
			entering={FadeIn.duration(200)}
		>
			<View style={styles.introBody}>
				<Text style={styles.introTitle} accessibilityRole="header">
					Scan your shelf
				</Text>
				<Text style={styles.introText}>{howTo}</Text>
				<Text style={styles.introText}>{finishNote}</Text>
			</View>
			<Pressable
				style={styles.introButton}
				onPress={onDismiss}
				accessibilityRole="button"
				accessibilityLabel="Got it, start scanning"
			>
				<Text style={styles.introButtonText}>Got it</Text>
			</Pressable>
		</Animated.View>
	);
}

/**
 * Brief white flash per capture — the silent-shutter acknowledgment. Animates only
 * on an INCREASE: these components remount (e.g. Empty → "Keep Scanning") with a
 * non-zero count, and replaying the flourish for a photo that wasn't taken reads
 * as a phantom capture. The caller skips this component entirely under reduce-motion
 * — a full-screen white flash is exactly what that setting (and photosensitivity
 * safety) wants gone.
 */
function CaptureFlash({ captureCount }: { captureCount: number }) {
	const opacity = useSharedValue(0);
	const previousCount = useRef(captureCount);
	useEffect(() => {
		const increased = captureCount > previousCount.current;
		previousCount.current = captureCount;
		if (!increased) return;
		opacity.value = withSequence(
			withTiming(0.5, { duration: 60 }),
			withTiming(0, { duration: 320 }),
		);
	}, [captureCount, opacity]);
	const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
	return <Animated.View style={[styles.flash, style]} />;
}

/** Capture tally that pops on each new still (increase-only, like the flash). */
function CaptureCounter({ count, reduceMotion }: { count: number; reduceMotion: boolean }) {
	const scale = useSharedValue(1);
	const previousCount = useRef(count);
	useEffect(() => {
		const increased = count > previousCount.current;
		previousCount.current = count;
		if (!increased || reduceMotion) return;
		scale.value = withSequence(withTiming(1.25, { duration: 90 }), withSpring(1, { damping: 12 }));
	}, [count, scale, reduceMotion]);
	const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
	return (
		<Animated.View style={[styles.counter, style]}>
			<Text style={styles.counterText} accessibilityLabel={photosCapturedLabel(count)}>
				{count}
			</Text>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		// True black behind the camera feed (same documented exception as scan.tsx).
		backgroundColor: '#000',
	},
	flash: {
		...StyleSheet.absoluteFill,
		// Raw white flash over the live feed — part of the camera-overlay exception.
		backgroundColor: '#fff',
		pointerEvents: 'none',
	},
	hud: {
		...StyleSheet.absoluteFill,
		justifyContent: 'space-between',
	},
	hudTop: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		// paddingTop is applied inline from the safe-area inset (clears the switcher).
		paddingHorizontal: 20,
	},
	hint: {
		flex: 1,
		color: tokens.text.primary,
		fontSize: 14,
		opacity: 0.85,
	},
	counter: {
		minWidth: 36,
		height: 36,
		borderRadius: 18,
		paddingHorizontal: 10,
		backgroundColor: tokens.accent.secondary,
		alignItems: 'center',
		justifyContent: 'center',
	},
	counterText: {
		color: tokens.text.inverse,
		fontSize: 15,
		fontWeight: '700',
	},
	hudBottom: {
		// paddingBottom is applied inline from the safe-area inset.
		alignItems: 'center',
		gap: 16,
	},
	shutter: {
		width: 64,
		height: 64,
		borderRadius: 32,
		borderWidth: 3,
		// White shutter ring over the live feed (camera-overlay exception).
		borderColor: 'rgba(255,255,255,0.9)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	shutterInner: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: 'rgba(255,255,255,0.85)',
	},
	shutterDisabled: {
		backgroundColor: 'rgba(255,255,255,0.25)',
	},
	finishShape: {
		alignSelf: 'stretch',
		marginHorizontal: 16,
		height: 52,
		borderRadius: 26,
		borderCurve: 'continuous',
		overflow: 'hidden',
		alignItems: 'center',
		justifyContent: 'center',
	},
	pressed: {
		opacity: 0.8,
	},
	// Glass shapes its rim from its own radius — match the capsule.
	finishGlass: {
		borderRadius: 26,
	},
	// Fallback fill where Liquid Glass isn't available.
	finishButton: {
		backgroundColor: tokens.accent.primary,
	},
	finishText: {
		color: tokens.text.inverse,
		fontSize: 16,
		fontWeight: '600',
	},
	finishGlassText: {
		color: tokens.text.primary,
		fontSize: 16,
		fontWeight: '600',
	},
	errorBanner: {
		marginTop: 16,
		marginHorizontal: 20,
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 8,
		backgroundColor: tokens.status.error,
	},
	errorBannerText: {
		color: tokens.text.inverse,
		fontSize: 13,
		fontWeight: '500',
		textAlign: 'center',
	},
	introOverlay: {
		...StyleSheet.absoluteFill,
		backgroundColor: tokens.surface.overlay,
		justifyContent: 'space-between',
		padding: 32,
	},
	introBody: {
		flex: 1,
		justifyContent: 'center',
		gap: 16,
	},
	introTitle: {
		color: tokens.text.primary,
		fontSize: 26,
		fontWeight: '700',
	},
	introText: {
		color: tokens.text.secondary,
		fontSize: 16,
		lineHeight: 23,
	},
	introButton: {
		paddingVertical: 16,
		borderRadius: 12,
		backgroundColor: tokens.accent.primary,
		alignItems: 'center',
	},
	introButtonText: {
		color: tokens.text.inverse,
		fontSize: 16,
		fontWeight: '600',
	},
	banner: {
		position: 'absolute',
		top: 120,
		alignSelf: 'center',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
		backgroundColor: tokens.surface.card,
	},
	bannerText: {
		color: tokens.text.secondary,
		fontSize: 13,
	},
	stateOverlay: {
		...StyleSheet.absoluteFill,
		backgroundColor: tokens.surface.overlay,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 32,
		gap: 12,
	},
	stateTitle: {
		color: tokens.text.primary,
		fontSize: 20,
		fontWeight: '600',
	},
	stateText: {
		color: tokens.text.secondary,
		fontSize: 14,
		textAlign: 'center',
	},
	primaryButton: {
		marginTop: 12,
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: tokens.accent.primary,
	},
	primaryButtonText: {
		color: tokens.text.inverse,
		fontSize: 14,
		fontWeight: '600',
	},
	secondaryButton: {
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: tokens.surface.card,
		borderWidth: 1,
		borderColor: tokens.border.subtle,
	},
	dismissButton: {
		marginTop: 12,
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: tokens.surface.card,
		borderWidth: 1,
		borderColor: tokens.border.subtle,
	},
	stateIsbn: {
		color: tokens.text.tertiary,
		fontSize: 12,
		fontFamily: 'monospace',
	},
	secondaryButtonText: {
		color: tokens.text.primary,
		fontSize: 14,
		fontWeight: '500',
	},
});
