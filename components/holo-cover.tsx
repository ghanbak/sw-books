import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
	Easing,
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from 'react-native-reanimated';

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
	onPress?: () => void;
	accessibilityLabel?: string;
};

/**
 * The hologram book cover that replaces the old 3D cover. `thumb` is a plain static
 * cover (no animation/sensors — safe to render per-row in FlashList). `hero` adds a
 * cyan projector beam + glowing base emitter with a slow looping pulse, gated on
 * reduce-motion. Gyroscope tilt (±15°) is added in a later step (device-only).
 */
export function HoloCover({
	coverUri,
	title,
	author,
	width,
	height,
	variant = 'thumb',
	onPress,
	accessibilityLabel,
}: HoloCoverProps) {
	const reduceMotion = useReduceMotion();

	const face = (
		<CoverFace coverUri={coverUri} title={title} author={author} width={width} height={height} />
	);

	let content = face;
	if (variant === 'hero') {
		const baseSpace = Math.max(14, Math.round(height * 0.12));
		content = (
			<View style={[styles.heroWrap, { width, height: height + baseSpace }]}>
				<Projector width={width} height={height} baseSpace={baseSpace} animated={!reduceMotion} />
				{face}
			</View>
		);
	}

	if (!onPress) return content;
	return (
		<Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
			{content}
		</Pressable>
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
		borderRadius: 4,
		overflow: 'hidden',
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
