import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { Camera } from 'react-native-vision-camera';

import { ShelfScanReview } from '@/components/shelf-scan-review';
import { tokens } from '@/constants/tokens';
import { announce, useReduceMotion, useScreenReaderEnabled } from '@/hooks/useAccessibility';
import { useShelfScan } from '@/hooks/useShelfScan';
import { deriveShelfChrome } from '@/lib/shelf-scan';

const INTRO_SEEN_KEY = '@ossus/scan_intro_seen';

/**
 * The shelf-scanner capture experience (plan Phase 3): silent hands-free
 * auto-capture with a ghost of the previous still as the overlap guide, a
 * per-capture flash + counter-pulse flourish, and the Finish → Processing →
 * Review/Empty hand-off, then the Phase 4 review overlay.
 *
 * Phase 5: shows a one-time intro before the first capture, reports its chrome
 * state up so the host can place + guard the mode switcher, and surfaces a
 * capture-failure banner.
 *
 * @param enabled tab focus (+ permission, gated by the host).
 * @param onImmersiveChange notifies the host when the review overlay takes/leaves the
 *   screen (drives switcher visibility — lag-tolerant, so a state callback is fine).
 * @param dirtyRef set each commit to whether a switch would discard work; the host's
 *   discard-confirm reads it at tap time, so it must NOT lag a frame behind a capture.
 */
export function ShelfScanCapture({
	enabled,
	onImmersiveChange,
	dirtyRef,
}: {
	enabled: boolean;
	onImmersiveChange?: (immersive: boolean) => void;
	dirtyRef?: MutableRefObject<boolean>;
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

	// Camera + sensors run only once the intro is dismissed, so auto-capture can't
	// fire behind the modal.
	const active = enabled && introSeen === true;
	// Screen-reader users get a pure manual-shutter flow — auto-capture's steadiness gate
	// is unusable without seeing the framing, and a surprise fire is worse than none.
	const scan = useShelfScan({ enabled: active, manualOnly: screenReaderEnabled });
	const { phase } = scan.state;
	const showCamera = active && (phase === 'capturing' || phase === 'interrupted');

	// `immersive` drives switcher visibility (host state, a one-frame lag is invisible);
	// `dirty` gates a destructive confirm, so it goes to a ref the host reads at tap time
	// — the effect flushes before the next touch event, so the ref is never stale.
	const { immersive, dirty } = deriveShelfChrome(phase, scan.captureCount);
	useEffect(() => {
		if (dirtyRef) dirtyRef.current = dirty;
		onImmersiveChange?.(immersive);
	}, [dirtyRef, dirty, onImmersiveChange, immersive]);

	// Screen-reader narration of the otherwise-silent flow (a sighted user reads this
	// off the flash + counter + state overlays; a VoiceOver user can't).
	const announcedCountRef = useRef(0);
	useEffect(() => {
		if (scan.captureCount > announcedCountRef.current) {
			announce(
				scan.captureCount === 1 ? '1 photo captured' : `${scan.captureCount} photos captured`,
			);
		}
		announcedCountRef.current = scan.captureCount;
	}, [scan.captureCount]);
	useEffect(() => {
		if (phase === 'processing') announce('Reading spines. Matching against the Archive.');
		else if (phase === 'empty') announce('No books recognized. Keep scanning or start over.');
	}, [phase]);
	useEffect(() => {
		if (scan.captureError) announce(scan.captureError);
	}, [scan.captureError]);

	const dismissIntro = useCallback(() => {
		setIntroSeen(true);
		AsyncStorage.setItem(INTRO_SEEN_KEY, '1').catch((cause) => {
			if (__DEV__) console.warn('[shelf-scan] intro flag write failed:', cause);
		});
	}, []);

	// First run: explain the silent auto-capture model before the camera starts. Gated on
	// `phase === 'capturing'` so a session resumed straight into Review (a draft survived a
	// tab switch) skips the intro — that user has already scanned.
	if (enabled && introSeen === false && phase === 'capturing') {
		return (
			<View style={styles.container}>
				<ShelfIntro onDismiss={dismissIntro} topInset={insets.top} />
			</View>
		);
	}

	return (
		<View style={styles.container}>
			{showCamera && (
				<Camera
					style={StyleSheet.absoluteFill}
					device="back"
					isActive={active && phase === 'capturing'}
					outputs={[scan.previewOutput, scan.photoOutput]}
				/>
			)}

			{/* Ghost of the previous still — a low-opacity overlap guide while panning. A
			    short crossfade softens the swap to a freshly captured frame (the previous
			    still is deleted the moment it stops being the ghost, so we can't hold it
			    through a full pre-decode). Disabled under reduce-motion. */}
			{showCamera && scan.ghostUri && (
				<Image
					source={{ uri: scan.ghostUri }}
					style={styles.ghost}
					contentFit="cover"
					transition={reduceMotion ? 0 : 120}
					accessible={false}
				/>
			)}

			{/* Reduce-motion: no flash at all — gated here so the component has no early
			    return after its hooks (and the difference from the counter is explicit). */}
			{showCamera && !reduceMotion && <CaptureFlash captureCount={scan.captureCount} />}

			{/* HUD only while actually capturing — during Interrupted the shutter and
			    Finish would render alive but dead (the reducer ignores them). */}
			{showCamera && phase === 'capturing' && (
				<View style={styles.hud} pointerEvents="box-none">
					<View style={[styles.hudTop, { paddingTop: insets.top + 60 }]}>
						<Text style={styles.hint}>
							{scan.atCap
								? 'Photo limit reached — tap Finish to see your books'
								: screenReaderEnabled
									? // Auto-capture relies on the visual ghost + steadiness; point the
										// screen-reader path at the reliable manual shutter instead.
										'Point at a shelf section, then double-tap Take Photo for each one. Tap Finish when done.'
									: 'Pan slowly across your shelf — photos snap when you hold steady'}
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

					<View style={styles.hudBottom}>
						<Pressable
							style={styles.shutter}
							onPress={scan.captureNow}
							disabled={scan.atCap}
							accessibilityRole="button"
							accessibilityLabel="Take photo"
							accessibilityHint="Captures a photo of your shelf now"
						>
							<View style={[styles.shutterInner, scan.atCap && styles.shutterDisabled]} />
						</Pressable>
						{scan.captureCount > 0 && (
							<Pressable
								style={styles.finishButton}
								onPress={scan.finish}
								accessibilityRole="button"
								accessibilityLabel={`Finish scanning, ${scan.captureCount} photos taken`}
							>
								<Text style={styles.finishText}>Finish</Text>
							</Pressable>
						)}
					</View>
				</View>
			)}

			{phase === 'interrupted' && (
				<Animated.View style={styles.banner} entering={FadeIn.duration(200)}>
					<Text style={styles.bannerText}>Paused — your captures are saved</Text>
				</Animated.View>
			)}

			{phase === 'processing' && (
				<Animated.View
					style={styles.stateOverlay}
					entering={FadeIn.duration(200)}
					exiting={FadeOut.duration(200)}
				>
					<ActivityIndicator size="large" color={tokens.accent.secondary} />
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
						each section.
					</Text>
					<Pressable
						style={styles.primaryButton}
						onPress={scan.keepScanning}
						accessibilityRole="button"
					>
						<Text style={styles.primaryButtonText}>Keep Scanning</Text>
					</Pressable>
					<Pressable style={styles.secondaryButton} onPress={scan.reset} accessibilityRole="button">
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
		</View>
	);
}

/**
 * One-time explainer for the silent auto-capture model (plan Phase 5 first-run).
 * Renders before the camera starts so panning instructions land before the first
 * photo, not after.
 */
function ShelfIntro({ onDismiss, topInset }: { onDismiss: () => void; topInset: number }) {
	return (
		<Animated.View
			style={[styles.introOverlay, { paddingTop: topInset + 24 }]}
			entering={FadeIn.duration(200)}
		>
			<View style={styles.introBody}>
				<Text style={styles.introTitle} accessibilityRole="header">
					Scan your shelf
				</Text>
				<Text style={styles.introText}>
					Pan the camera slowly across a row of spines. Photos snap on their own each time you hold
					steady — no tapping.
				</Text>
				<Text style={styles.introText}>
					Tap Finish when you're done and we'll match what we found against the Archive.
				</Text>
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
			<Text style={styles.counterText} accessibilityLabel={`${count} photos captured`}>
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
	ghost: {
		...StyleSheet.absoluteFillObject,
		opacity: 0.18,
		pointerEvents: 'none',
	},
	flash: {
		...StyleSheet.absoluteFillObject,
		// Raw white flash over the live feed — part of the camera-overlay exception.
		backgroundColor: '#fff',
		pointerEvents: 'none',
	},
	hud: {
		...StyleSheet.absoluteFillObject,
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
		alignItems: 'center',
		paddingBottom: 48,
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
	finishButton: {
		paddingHorizontal: 28,
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: tokens.accent.primary,
	},
	finishText: {
		color: tokens.text.primary,
		fontSize: 15,
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
		color: tokens.text.primary,
		fontSize: 13,
		fontWeight: '500',
		textAlign: 'center',
	},
	introOverlay: {
		...StyleSheet.absoluteFillObject,
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
		color: tokens.text.primary,
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
		...StyleSheet.absoluteFillObject,
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
		color: tokens.text.primary,
		fontSize: 14,
		fontWeight: '600',
	},
	secondaryButton: {
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: 'rgba(255,255,255,0.12)',
	},
	secondaryButtonText: {
		color: tokens.text.primary,
		fontSize: 14,
		fontWeight: '500',
	},
});
