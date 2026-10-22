import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CanonBadge } from '@/components/ui/canon-badge';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { getCoverColor } from '@/lib/cover';

type HoloCoverProps = {
	coverUri: string | null;
	title: string;
	author: string[];
	width: number;
	height: number;
	onPress?: () => void;
	accessibilityLabel?: string;
};

/**
 * The static hologram cover used in lists (Archives/Library rows, added-books sheet, scan
 * review): tint + luminosity blend + scanlines + edge glow, no bloom, no animation — safe to
 * render per row in FlashList. The animated hero on the Timeline and book detail is the 3D
 * WebGPU stage (components/holo-stage.tsx); `HoloFace` is its loading/fallback face.
 */
export function HoloCover({
	coverUri,
	title,
	author,
	width,
	height,
	onPress,
	accessibilityLabel,
}: HoloCoverProps) {
	const content = (
		<HoloFace
			coverUri={coverUri}
			title={title}
			author={author}
			width={width}
			height={height}
			glow={false}
		/>
	);
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

/**
 * The holographic projection of a cover (Figma "projected-cover"): a blue tint gradient
 * underneath, then the cover `luminosity`-blended on top so it keeps its brightness but
 * takes the gradient's blue hue/saturation (reads as a blue hologram), then scanlines and an
 * inner edge glow. `isolation: 'isolate'` scopes the blend to the card (not the dark screen
 * behind it); the outer cyan bloom lives on an unclipped wrapper since the clip would hide an
 * outset shadow. Exported as the 3D stage's loading/fallback face (with the canon badge).
 */
export function HoloFace({
	coverUri,
	title,
	author,
	width,
	height,
	glow = true,
	canon,
}: {
	coverUri: string | null;
	title: string;
	author: string[];
	width: number;
	height: number;
	/** Outer cyan bloom. Thumbs in lists pass false — tint/scanlines/edge only. */
	glow?: boolean;
	/** When set, overlays a Canon/Legends badge in the cover's top corner. */
	canon?: string;
}) {
	return (
		<View style={[styles.holoGlow, glow && styles.holoBloom, { width, height }]}>
			<View style={[styles.holoClip, { width, height }]}>
				<LinearGradient
					pointerEvents="none"
					colors={[tokens.holo.tintTop, tokens.holo.tintMid, tokens.holo.tintBottom]}
					locations={[0, 0.4, 1]}
					style={StyleSheet.absoluteFill}
				/>
				{/* mixBlendMode is a ViewStyle prop (not on expo-image's ImageStyle), so the
				    luminosity blend goes on a wrapper that composites the cover subtree. */}
				<View style={styles.blendLayer}>
					<CoverFace
						coverUri={coverUri}
						title={title}
						author={author}
						width={width}
						height={height}
					/>
				</View>
				<Scanlines height={height} />
				<View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.innerGlow]} />
			</View>
			{/* Corner badge sits on the unclipped wrapper (full opacity, above the tinted clip). */}
			{canon ? <CanonBadge canon={canon} style={styles.heroBadge} /> : null}
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

const styles = StyleSheet.create({
	face: {
		borderRadius: 8,
		overflow: 'hidden',
	},
	holoGlow: {
		borderRadius: 8,
	},
	// Outer cyan bloom (dual-radius, per the design) — hero only. Must NOT clip; an outset
	// shadow doesn't render under overflow:hidden.
	holoBloom: {
		boxShadow: [
			{
				offsetX: 0,
				offsetY: 0,
				blurRadius: 32,
				spreadDistance: 4,
				color: tokens.holo.bloom,
			},
			{
				offsetX: 0,
				offsetY: 0,
				blurRadius: 216,
				spreadDistance: 16,
				color: tokens.holo.bloom,
			},
		],
	},
	// Clips the tint, blended cover, scanlines, and edge glow to the rounded cover.
	// `isolation` scopes the luminosity blend to this group, not the screen behind.
	holoClip: {
		borderRadius: 8,
		overflow: 'hidden',
		isolation: 'isolate',
		opacity: 0.92,
	},
	// Luminosity blend: keep the cover's brightness, take hue/saturation from the blue tint
	// beneath. Inherently desaturates (no `filter` needed), so expo-image can stay.
	blendLayer: {
		mixBlendMode: 'luminosity',
	},
	// Inner edge glow, painted on top — matches the design's inset box-shadow.
	innerGlow: {
		borderRadius: 8,
		boxShadow: [
			{
				offsetX: 0,
				offsetY: 0,
				blurRadius: 8,
				color: tokens.holo.innerGlow,
				inset: true,
			},
		],
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
	heroBadge: {
		position: 'absolute',
		top: 8,
		left: 8,
	},
});
