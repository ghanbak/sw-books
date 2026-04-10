import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
	type SharedValue,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from 'react-native-reanimated';

const COVER_COLORS = [
	'#8B0000',
	'#1a3a5c',
	'#2d4a22',
	'#4a2545',
	'#5c3a1a',
	'#1a4a4a',
	'#3d2b1f',
	'#4a1a1a',
	'#1a2a4a',
	'#3a1a4a',
];

function getCoverColor(title: string): string {
	let hash = 0;
	for (let i = 0; i < title.length; i++) {
		hash = (hash << 5) - hash + title.charCodeAt(i);
		hash |= 0;
	}
	return COVER_COLORS[Math.abs(hash) % COVER_COLORS.length];
}

export interface Book3DProps {
	coverUri: string | null;
	title: string;
	author: string[];
	width: number;
	height: number;
	spineWidth?: number;
	spineColor?: string;
	rotateY?: SharedValue<number>;
	onPress?: () => void;
	accessibilityLabel: string;
}

export function Book3D({
	coverUri,
	title,
	author,
	width,
	height,
	spineWidth = 14,
	spineColor = '#2c1810',
	rotateY: externalRotateY,
	onPress,
	accessibilityLabel,
}: Book3DProps) {
	const [imageError, setImageError] = useState(false);
	const showFallback = !coverUri || imageError;
	const isPressed = useSharedValue(false);
	const defaultRotateY = useSharedValue(-15);
	const rotateY = externalRotateY ?? defaultRotateY;

	const pressStyle = useAnimatedStyle(() => ({
		transform: [{ scale: withSpring(isPressed.value ? 0.96 : 1, { damping: 15 }) }],
	}));

	const bookStyle = useAnimatedStyle(() => ({
		transform: [
			{ perspective: 800 },
			{ translateX: -width / 2 },
			{ rotateY: `${rotateY.value}deg` },
			{ translateX: width / 2 },
		],
	}));

	return (
		<Pressable
			onPress={onPress}
			onPressIn={() => {
				isPressed.value = true;
			}}
			onPressOut={() => {
				isPressed.value = false;
			}}
			accessibilityLabel={accessibilityLabel}
			accessibilityRole="button"
		>
			<Animated.View style={pressStyle}>
				<Animated.View
					style={[
						{
							width,
							height,
							shadowColor: '#000',
							shadowOffset: { width: 4, height: 6 },
							shadowOpacity: 0.25,
							shadowRadius: 12,
							elevation: 8,
						},
						bookStyle,
					]}
				>
					{/* Spine strip */}
					<View
						style={[
							styles.spine,
							{
								width: spineWidth,
								backgroundColor: spineColor,
							},
						]}
					/>

					{/* Cover content */}
					{showFallback ? (
						<View
							style={[
								styles.coverFill,
								{ borderRadius: 4, backgroundColor: getCoverColor(title) },
							]}
						>
							<View style={styles.fallbackContent}>
								<Text style={styles.fallbackTitle} numberOfLines={3}>
									{title}
								</Text>
								<Text style={styles.fallbackAuthor} numberOfLines={1}>
									{author.join(', ')}
								</Text>
							</View>
						</View>
					) : (
						<Image
							source={{ uri: coverUri }}
							style={[styles.coverFill, { borderRadius: 4 }]}
							contentFit="cover"
							onError={() => setImageError(true)}
						/>
					)}

					{/* Light gradient overlay */}
					<LinearGradient
						colors={[
							'rgba(255,255,255,0.15)',
							'transparent',
							'rgba(0,0,0,0.12)',
						]}
						start={{ x: 0, y: 0 }}
						end={{ x: 1, y: 0 }}
						style={[StyleSheet.absoluteFill, { borderRadius: 4 }]}
					/>
				</Animated.View>
			</Animated.View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	spine: {
		position: 'absolute',
		left: 0,
		top: 0,
		bottom: 0,
		zIndex: 1,
		borderTopLeftRadius: 2,
		borderBottomLeftRadius: 2,
	},
	coverFill: {
		...StyleSheet.absoluteFillObject,
	},
	fallbackContent: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 12,
	},
	fallbackTitle: {
		color: '#fff',
		fontWeight: '700',
		textAlign: 'center',
		fontSize: 13,
	},
	fallbackAuthor: {
		color: 'rgba(255,255,255,0.6)',
		textAlign: 'center',
		fontSize: 10,
		marginTop: 4,
	},
});
