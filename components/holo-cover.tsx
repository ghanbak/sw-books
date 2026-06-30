import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
	Easing,
	Extrapolation,
	interpolate,
	SensorType,
	useAnimatedSensor,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { useReduceMotion } from '@/hooks/useAccessibility';
import { getCoverColor } from '@/lib/cover';

type HoloCoverProps = {
	coverUri: string | null;
	title: string;
	author: string[];
	width: number;
	height: number;
	/** `hero` = animated projection (detail/timeline); `thumb` = static (lists/scan). */
	variant?: 'hero' | 'thumb';
	/** Gyroscope tilt on the hero (default true). Pass false to skip the sensor. */
	tilt?: boolean;
	onPress?: () => void;
	accessibilityLabel?: string;
};

/**
 * The hologram book cover that replaces the old 3D cover. `thumb` is a plain static
 * cover (no animation/sensors — safe to render per-row in FlashList). `hero` adds a
 * cyan projector beam + glowing base emitter with a slow looping pulse, gated on
 * reduce-motion. The hero also tilts ±15° with the gyroscope, relative to how the
 * device is held (gated on reduce-motion; the sensor is a no-op in the simulator).
 */
const MAX_TILT = 15 * (Math.PI / 180);

export function HoloCover({
	coverUri,
	title,
	author,
	width,
	height,
	variant = 'thumb',
	tilt,
	onPress,
	accessibilityLabel,
}: HoloCoverProps) {
	const reduceMotion = useReduceMotion();

	let content = (
		<CoverFace coverUri={coverUri} title={title} author={author} width={width} height={height} />
	);
	if (variant === 'hero') {
		const baseSpace = Math.max(14, Math.round(height * 0.12));
		const animated = !reduceMotion;
		// Hero gets the holographic face (blue tint + scanlines + glow); thumbs stay plain covers.
		const holoFace = (
			<HoloFace coverUri={coverUri} title={title} author={author} width={width} height={height} />
		);
		// Mount the sensor-bearing hero only when tilt is on, so thumbs and reduce-motion
		// heroes never subscribe to the device-motion sensor.
		const props = { width, height, baseSpace, animated };
		content =
			tilt !== false && !reduceMotion ? (
				<TiltedHero {...props}>{holoFace}</TiltedHero>
			) : (
				<StaticHero {...props}>{holoFace}</StaticHero>
			);
	}

	if (!onPress) return content;
	return (
		<Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
			{content}
		</Pressable>
	);
}

type HeroProps = {
	width: number;
	height: number;
	baseSpace: number;
	animated: boolean;
	children: ReactNode;
};

function StaticHero({ width, height, baseSpace, animated, children }: HeroProps) {
	return (
		<View style={[styles.heroWrap, { width, height: height + baseSpace }]}>
			<Projector width={width} height={height} baseSpace={baseSpace} animated={animated} />
			{children}
		</View>
	);
}

/** Hero whose cover tilts ±15° with the device gyroscope (no-op in the iOS simulator). */
function TiltedHero({ width, height, baseSpace, animated, children }: HeroProps) {
	const sensor = useAnimatedSensor(SensorType.ROTATION, { interval: 'auto' });
	// Baseline = device orientation captured from the first real reading. Tilt tracks
	// movement RELATIVE to it, so the cover sits neutral at whatever angle the device is
	// held — absolute pitch/roll would pin it at the ±15° clamp at any reading angle.
	const baseline = useSharedValue<{ pitch: number; roll: number } | null>(null);
	const tiltStyle = useAnimatedStyle(() => {
		const { pitch, roll } = sensor.sensor.value;
		const base = baseline.value;
		if (base === null) {
			// Skip the initial (0,0) pre-warmup frame; latch the first real reading.
			if (pitch !== 0 || roll !== 0) baseline.value = { pitch, roll };
			return { transform: [{ perspective: 800 }] };
		}
		const clampTilt = (v: number) =>
			interpolate(v, [-MAX_TILT, MAX_TILT], [-MAX_TILT, MAX_TILT], Extrapolation.CLAMP);
		// withTiming chases the moving sensor target → ~90ms damped follow (smooths jitter).
		const rx = withTiming(clampTilt(pitch - base.pitch), { duration: 90 });
		const ry = withTiming(clampTilt(roll - base.roll), { duration: 90 });
		return { transform: [{ perspective: 800 }, { rotateX: `${rx}rad` }, { rotateY: `${ry}rad` }] };
	});
	return (
		<View style={[styles.heroWrap, { width, height: height + baseSpace }]}>
			<Projector width={width} height={height} baseSpace={baseSpace} animated={animated} />
			<Animated.View style={tiltStyle}>{children}</Animated.View>
		</View>
	);
}

/** The cover image, or a deterministic colored fallback with the title/author. */
function CoverFace({
	coverUri,
	title,
	author,
	width,
	height,
}: {
	coverUri: string | null;
	title: string;
	author: string[];
	width: number;
	height: number;
}) {
	const [errored, setErrored] = useState(false);
	if (!coverUri || errored) {
		return (
			<View
				style={[
					styles.face,
					styles.fallback,
					{ width, height, backgroundColor: getCoverColor(title) },
				]}
			>
				<Text numberOfLines={3} style={styles.fallbackTitle}>
					{title}
				</Text>
				<Text numberOfLines={1} style={styles.fallbackAuthor}>
					{author.join(', ')}
				</Text>
			</View>
		);
	}
	return (
		<Image
			source={{ uri: coverUri }}
			style={[styles.face, { width, height }]}
			contentFit="cover"
			recyclingKey={coverUri}
			cachePolicy="memory-disk"
			onError={() => setErrored(true)}
		/>
	);
}

/**
 * The holographic projection of a cover (Figma "projected-cover"): the real cover under a
 * blue tint gradient, horizontal scanlines, an inner edge glow, and an outer cyan bloom.
 * The bloom lives on an unclipped outer wrap; the tint/scanlines/edge are clipped to the
 * rounded cover so they don't bleed past it.
 */
function HoloFace({
	coverUri,
	title,
	author,
	width,
	height,
}: {
	coverUri: string | null;
	title: string;
	author: string[];
	width: number;
	height: number;
}) {
	return (
		<View style={[styles.holoGlow, { width, height }]}>
			<View style={[styles.holoClip, { width, height }]}>
				<CoverFace
					coverUri={coverUri}
					title={title}
					author={author}
					width={width}
					height={height}
				/>
				<LinearGradient
					pointerEvents="none"
					colors={[tokens.holo.tintTop, tokens.holo.tintMid, tokens.holo.tintBottom]}
					locations={[0, 0.4, 1]}
					style={StyleSheet.absoluteFill}
				/>
				<Scanlines height={height} />
				<View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.innerGlow]} />
			</View>
		</View>
	);
}

/** Evenly spaced horizontal hologram scanlines (12px pitch) clipped to the cover. */
function Scanlines({ height }: { height: number }) {
	const tops: number[] = [];
	for (let y = 6; y < height; y += 12) tops.push(y);
	return (
		<View pointerEvents="none" style={StyleSheet.absoluteFill}>
			{tops.map((top) => (
				<View key={top} style={[styles.scanline, { top }]} />
			))}
		</View>
	);
}

/** Cyan beam cone behind the cover + a glowing base emitter, slow looping pulse. */
function Projector({
	width,
	height,
	baseSpace,
	animated,
}: {
	width: number;
	height: number;
	baseSpace: number;
	animated: boolean;
}) {
	const t = useSharedValue(animated ? 0 : 0.5);
	useEffect(() => {
		if (!animated) {
			t.value = 0.5;
			return;
		}
		t.value = withRepeat(
			withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.quad) }),
			-1,
			true,
		);
	}, [animated, t]);

	const beamStyle = useAnimatedStyle(() => ({
		opacity: interpolate(t.value, [0, 1], [0.25, 0.5]),
	}));
	const emitterStyle = useAnimatedStyle(() => ({
		opacity: interpolate(t.value, [0, 1], [0.45, 0.7]),
		transform: [{ scaleX: interpolate(t.value, [0, 1], [0.9, 1.05]) }],
	}));

	const emitterW = Math.round(width * 0.7);
	const transparent = `${tokens.holo.cyan}00`;

	return (
		<View pointerEvents="none" style={StyleSheet.absoluteFill}>
			<Animated.View style={[styles.beam, { width, height }, beamStyle]}>
				<LinearGradient
					colors={[transparent, tokens.holo.beam, transparent]}
					start={{ x: 0.5, y: 1 }}
					end={{ x: 0.5, y: 0 }}
					style={StyleSheet.absoluteFill}
				/>
			</Animated.View>
			<Animated.View
				style={[
					styles.emitter,
					{ width: emitterW, marginLeft: -emitterW / 2, height: Math.max(10, baseSpace) },
					emitterStyle,
				]}
			>
				<LinearGradient
					colors={[tokens.holo.emitter, transparent]}
					start={{ x: 0.5, y: 0 }}
					end={{ x: 0.5, y: 1 }}
					style={StyleSheet.absoluteFill}
				/>
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	heroWrap: {
		alignItems: 'center',
	},
	face: {
		borderRadius: 8,
		overflow: 'hidden',
	},
	// Outer cyan bloom — must NOT clip (iOS shadows don't render under overflow:hidden).
	holoGlow: {
		borderRadius: 8,
		shadowColor: tokens.holo.glow,
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: 0.6,
		shadowRadius: 24,
		elevation: 12,
	},
	// Clips the tint, scanlines, and edge glow to the rounded cover.
	holoClip: {
		borderRadius: 8,
		overflow: 'hidden',
		opacity: 0.95,
	},
	innerGlow: {
		borderRadius: 8,
		borderWidth: 1.5,
		borderColor: tokens.holo.innerGlow,
	},
	scanline: {
		position: 'absolute',
		left: 0,
		right: 0,
		height: 2,
		backgroundColor: tokens.holo.scanline,
	},
	fallback: {
		justifyContent: 'center',
		alignItems: 'center',
		padding: 12,
	},
	fallbackTitle: {
		color: tokens.text.primary,
		fontWeight: '700',
		textAlign: 'center',
		fontSize: 13,
	},
	fallbackAuthor: {
		color: tokens.text.secondary,
		textAlign: 'center',
		fontSize: 10,
		marginTop: 4,
	},
	beam: {
		position: 'absolute',
		top: 0,
	},
	emitter: {
		position: 'absolute',
		bottom: 2,
		left: '50%',
		borderRadius: 999,
	},
});
