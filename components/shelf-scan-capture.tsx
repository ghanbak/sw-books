import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
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
import { Camera } from 'react-native-vision-camera';

import { tokens } from '@/constants/tokens';
import { useShelfScan } from '@/hooks/useShelfScan';

/**
 * The shelf-scanner capture experience (plan Phase 3): silent hands-free
 * auto-capture with a ghost of the previous still as the overlap guide, a
 * per-capture flash + counter-pulse flourish, and the Finish → Processing →
 * Review/Empty hand-off. The review overlay itself lands in Phase 4 — until
 * then `review` renders a minimal recognized-count card so the capture loop is
 * QA-able on device end-to-end.
 */
export function ShelfScanCapture({ enabled }: { enabled: boolean }) {
	const scan = useShelfScan({ enabled });
	const { phase } = scan.state;
	const showCamera = enabled && (phase === 'capturing' || phase === 'interrupted');

	return (
		<View style={styles.container}>
			{showCamera && (
				<Camera
					style={StyleSheet.absoluteFill}
					device="back"
					isActive={enabled && phase === 'capturing'}
					outputs={[scan.previewOutput, scan.photoOutput]}
				/>
			)}

			{/* Ghost of the previous still — a low-opacity overlap guide while panning. */}
			{showCamera && scan.ghostUri && (
				<Image
					source={{ uri: scan.ghostUri }}
					style={styles.ghost}
					contentFit="cover"
					accessible={false}
				/>
			)}

			{showCamera && <CaptureFlash captureCount={scan.captureCount} />}

			{/* HUD only while actually capturing — during Interrupted the shutter and
			    Finish would render alive but dead (the reducer ignores them). */}
			{showCamera && phase === 'capturing' && (
				<View style={styles.hud} pointerEvents="box-none">
					<View style={styles.hudTop}>
						<Text style={styles.hint}>
							{scan.atCap
								? 'Photo limit reached — tap Finish to see your books'
								: 'Pan slowly across your shelf — photos snap when you hold steady'}
						</Text>
						{scan.captureCount > 0 && <CaptureCounter count={scan.captureCount} />}
					</View>

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
					<Text style={styles.stateTitle}>Reading spines…</Text>
					<Text style={styles.stateText}>Matching against the Archive</Text>
				</Animated.View>
			)}

			{phase === 'empty' && (
				<Animated.View
					style={styles.stateOverlay}
					entering={FadeIn.duration(200)}
					exiting={FadeOut.duration(200)}
				>
					<Text style={styles.stateTitle}>No books recognized</Text>
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

			{/* Phase 4 replaces this with the full review overlay (list/grid, swap, Add). */}
			{phase === 'review' && (
				<Animated.View
					style={styles.stateOverlay}
					entering={FadeIn.duration(200)}
					exiting={FadeOut.duration(200)}
				>
					<Text style={styles.stateTitle}>Spines recognized</Text>
					<Text style={styles.stateText}>The review queue arrives in Phase 4.</Text>
					<Pressable style={styles.secondaryButton} onPress={scan.reset} accessibilityRole="button">
						<Text style={styles.secondaryButtonText}>Scan Again</Text>
					</Pressable>
				</Animated.View>
			)}
		</View>
	);
}

/**
 * Brief white flash per capture — the silent-shutter acknowledgment. Animates only
 * on an INCREASE: these components remount (e.g. Empty → "Keep Scanning") with a
 * non-zero count, and replaying the flourish for a photo that wasn't taken reads
 * as a phantom capture.
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
function CaptureCounter({ count }: { count: number }) {
	const scale = useSharedValue(1);
	const previousCount = useRef(count);
	useEffect(() => {
		const increased = count > previousCount.current;
		previousCount.current = count;
		if (!increased) return;
		scale.value = withSequence(withTiming(1.25, { duration: 90 }), withSpring(1, { damping: 12 }));
	}, [count, scale]);
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
		paddingTop: 72,
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
