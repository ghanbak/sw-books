import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
	FadeIn,
	FadeOut,
	cancelAnimation,
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withDecay,
} from 'react-native-reanimated';

const DEGREES_PER_PIXEL = 0.3;

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

interface Book3DViewerProps {
	visible: boolean;
	onClose: () => void;
	coverUri: string | null;
	title: string;
	author: string[];
}

export function Book3DViewer({
	visible,
	onClose,
	coverUri,
	title,
	author,
}: Book3DViewerProps) {
	const { width: screenWidth } = useWindowDimensions();
	const bookWidth = Math.min(screenWidth * 0.55, 240);
	const bookHeight = bookWidth * 1.5;
	const spineWidth = 20;

	const [imageError, setImageError] = useState(false);
	const showFallback = !coverUri || imageError;

	const rotationY = useSharedValue(-15);
	const rotationX = useSharedValue(0);
	const savedRotY = useSharedValue(-15);
	const savedRotX = useSharedValue(0);

	const panGesture = Gesture.Pan()
		.onBegin(() => {
			'worklet';
			cancelAnimation(rotationY);
			cancelAnimation(rotationX);
			savedRotY.value = rotationY.value;
			savedRotX.value = rotationX.value;
		})
		.onUpdate((event) => {
			'worklet';
			rotationY.value = savedRotY.value + event.translationX * DEGREES_PER_PIXEL;
			rotationX.value = savedRotX.value - event.translationY * DEGREES_PER_PIXEL;
		})
		.onEnd((event) => {
			'worklet';
			rotationY.value = withDecay({
				velocity: event.velocityX * DEGREES_PER_PIXEL,
				deceleration: 0.993,
				clamp: [-180, 180],
			});
			rotationX.value = withDecay({
				velocity: -event.velocityY * DEGREES_PER_PIXEL,
				deceleration: 0.993,
				clamp: [-45, 45],
			});
		});

	const bookStyle = useAnimatedStyle(() => ({
		transform: [
			{ perspective: 800 },
			{ translateX: -bookWidth / 2 },
			{ rotateY: `${rotationY.value}deg` },
			{ translateX: bookWidth / 2 },
			{ rotateX: `${rotationX.value}deg` },
		],
	}));

	const lightStyle = useAnimatedStyle(() => ({
		opacity: interpolate(Math.abs(rotationY.value), [0, 30, 60], [0.1, 0.2, 0.35]),
		transform: [
			{
				translateX: interpolate(
					rotationY.value,
					[-60, 0, 60],
					[-bookWidth / 2, 0, bookWidth / 2],
				),
			},
		],
	}));

	const handleClose = () => {
		// Reset rotation for next open
		rotationY.value = -15;
		rotationX.value = 0;
		savedRotY.value = -15;
		savedRotX.value = 0;
		onClose();
	};

	return (
		<Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
			<GestureHandlerRootView style={styles.gestureRoot}>
				<Animated.View style={styles.overlay} entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
					{/* Close button */}
					<Pressable style={styles.closeButton} onPress={handleClose} accessibilityLabel="Close" accessibilityRole="button">
						<Text style={styles.closeText}>✕</Text>
					</Pressable>

					{/* 3D Book */}
					<GestureDetector gesture={panGesture}>
						<Animated.View
							style={[
								{
									width: bookWidth,
									height: bookHeight,
									shadowColor: '#000',
									shadowOffset: { width: 6, height: 10 },
									shadowOpacity: 0.4,
									shadowRadius: 20,
									elevation: 12,
								},
								bookStyle,
							]}
						>
							{/* Spine */}
							<View
								style={[
									styles.spine,
									{ width: spineWidth, backgroundColor: '#2c1810' },
								]}
							/>

							{/* Cover */}
							{showFallback ? (
								<View
									style={[
										styles.coverFill,
										{ borderRadius: 6, backgroundColor: getCoverColor(title) },
									]}
								>
									<View style={styles.fallbackContent}>
										<Text style={styles.fallbackTitle} numberOfLines={4}>
											{title}
										</Text>
										<Text style={styles.fallbackAuthor} numberOfLines={2}>
											{author.join(', ')}
										</Text>
									</View>
								</View>
							) : (
								<Image
									source={{ uri: coverUri }}
									style={[styles.coverFill, { borderRadius: 6 }]}
									contentFit="cover"
									onError={() => setImageError(true)}
								/>
							)}

							{/* Animated light overlay */}
							<Animated.View
								style={[StyleSheet.absoluteFill, { borderRadius: 6, overflow: 'hidden' }, lightStyle]}
							>
								<LinearGradient
									colors={[
										'rgba(255,255,255,0.3)',
										'transparent',
										'rgba(0,0,0,0.2)',
									]}
									start={{ x: 0, y: 0 }}
									end={{ x: 1, y: 0 }}
									style={StyleSheet.absoluteFill}
								/>
							</Animated.View>
						</Animated.View>
					</GestureDetector>

					{/* Title and author below */}
					<View style={styles.info}>
						<Text style={styles.title} numberOfLines={2}>
							{title}
						</Text>
						<Text style={styles.author} numberOfLines={1}>
							{author.join(', ')}
						</Text>
						<Text style={styles.hint}>Drag to rotate</Text>
					</View>
				</Animated.View>
			</GestureHandlerRootView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	gestureRoot: {
		flex: 1,
	},
	overlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.85)',
		justifyContent: 'center',
		alignItems: 'center',
	},
	closeButton: {
		position: 'absolute',
		top: 60,
		right: 20,
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: 'rgba(255,255,255,0.15)',
		justifyContent: 'center',
		alignItems: 'center',
		zIndex: 10,
	},
	closeText: {
		color: '#fff',
		fontSize: 18,
		fontWeight: '600',
	},
	spine: {
		position: 'absolute',
		left: 0,
		top: 0,
		bottom: 0,
		zIndex: 1,
		borderTopLeftRadius: 3,
		borderBottomLeftRadius: 3,
	},
	coverFill: {
		...StyleSheet.absoluteFillObject,
	},
	fallbackContent: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	fallbackTitle: {
		color: '#fff',
		fontWeight: '700',
		textAlign: 'center',
		fontSize: 18,
	},
	fallbackAuthor: {
		color: 'rgba(255,255,255,0.6)',
		textAlign: 'center',
		fontSize: 13,
		marginTop: 8,
	},
	info: {
		marginTop: 32,
		alignItems: 'center',
		paddingHorizontal: 32,
	},
	title: {
		color: '#fff',
		fontSize: 20,
		fontWeight: '700',
		textAlign: 'center',
	},
	author: {
		color: 'rgba(255,255,255,0.6)',
		fontSize: 15,
		marginTop: 6,
	},
	hint: {
		color: 'rgba(255,255,255,0.3)',
		fontSize: 12,
		marginTop: 16,
	},
});
