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
import { tokens } from '@/constants/tokens';
import { getCoverColor } from './Book3D';

const DEGREES_PER_PIXEL = 0.3;
const BOOK_DEPTH = 28; // thickness of book spine in px

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

	// Main book rotation (front cover)
	const bookStyle = useAnimatedStyle(() => ({
		transform: [
			{ perspective: 1000 },
			{ rotateX: `${rotationX.value}deg` },
			{ rotateY: `${rotationY.value}deg` },
		],
	}));

	// Spine: visible width based on rotation angle
	// When facing straight on (0deg), spine is invisible (edge-on)
	// When rotated, spine becomes visible
	const spineStyle = useAnimatedStyle(() => {
		const absAngle = Math.abs(rotationY.value);
		// Spine visible width increases with rotation
		const visibleWidth = interpolate(absAngle, [0, 90], [0, BOOK_DEPTH], 'clamp');
		// Spine appears on the leading edge based on rotation direction
		const spineOpacity = interpolate(absAngle, [0, 10, 90], [0, 1, 1], 'clamp');

		return {
			width: visibleWidth,
			opacity: spineOpacity,
		};
	});

	// Page edges on the right side — visible at angles
	const pageEdgeStyle = useAnimatedStyle(() => {
		const absAngle = Math.abs(rotationY.value);
		const visibleWidth = interpolate(absAngle, [0, 90], [0, BOOK_DEPTH], 'clamp');
		const pageOpacity = interpolate(absAngle, [0, 10, 90], [0, 0.8, 1], 'clamp');

		return {
			width: visibleWidth,
			opacity: pageOpacity,
		};
	});

	// Dynamic lighting overlay
	const lightStyle = useAnimatedStyle(() => ({
		opacity: interpolate(Math.abs(rotationY.value), [0, 30, 60], [0.05, 0.15, 0.3]),
	}));

	// Light position shifts with rotation
	const lightGradientStart = useAnimatedStyle(() => {
		const x = interpolate(rotationY.value, [-60, 0, 60], [1, 0.3, 0]);
		return { opacity: 1, left: `${x * 100}%` as unknown as number };
	});

	const handleClose = () => {
		rotationY.value = -15;
		rotationX.value = 0;
		savedRotY.value = -15;
		savedRotX.value = 0;
		onClose();
	};

	const fallbackColor = getCoverColor(title);

	return (
		<Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
			<GestureHandlerRootView style={styles.gestureRoot}>
				<Animated.View
					style={styles.overlay}
					entering={FadeIn.duration(200)}
					exiting={FadeOut.duration(200)}
				>
					{/* Close button */}
					<Pressable
						style={styles.closeButton}
						onPress={handleClose}
						accessibilityLabel="Close"
						accessibilityRole="button"
					>
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
									shadowOpacity: 0.5,
									shadowRadius: 24,
									elevation: 16,
								},
								bookStyle,
							]}
						>
							{/* Spine — dark strip on the left, width driven by rotation */}
							<Animated.View
								style={[
									styles.spineFace,
									{ height: bookHeight, backgroundColor: '#1a0f08' },
									spineStyle,
								]}
							>
								<LinearGradient
									colors={[
										'rgba(255,255,255,0.08)',
										'rgba(0,0,0,0.1)',
										'rgba(0,0,0,0.3)',
									]}
									start={{ x: 0, y: 0 }}
									end={{ x: 1, y: 0 }}
									style={StyleSheet.absoluteFill}
								/>
							</Animated.View>

							{/* Front cover */}
							<View
								style={[
									styles.coverFace,
									{
										width: bookWidth,
										height: bookHeight,
										borderRadius: 4,
										overflow: 'hidden',
									},
								]}
							>
								{showFallback ? (
									<View
										style={[
											StyleSheet.absoluteFillObject,
											{ backgroundColor: fallbackColor },
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
										style={StyleSheet.absoluteFillObject}
										contentFit="cover"
										onError={() => setImageError(true)}
									/>
								)}

								{/* Spine indent on front cover — Apple Books crease */}
								<LinearGradient
									colors={[
										'rgba(0,0,0,0.25)',
										'rgba(0,0,0,0.08)',
										'rgba(255,255,255,0.3)',
										'rgba(255,255,255,0.05)',
										'transparent',
									]}
									locations={[0, 0.12, 0.25, 0.45, 1]}
									start={{ x: 0, y: 0 }}
									end={{ x: 1, y: 0 }}
									style={[StyleSheet.absoluteFill, { width: bookWidth * 0.12 }]}
								/>

								{/* Dynamic light overlay */}
								<Animated.View style={[StyleSheet.absoluteFill, lightStyle]}>
									<LinearGradient
										colors={[
											'rgba(255,255,255,0.35)',
											'transparent',
											'rgba(0,0,0,0.2)',
										]}
										start={{ x: 0, y: 0 }}
										end={{ x: 1, y: 0 }}
										style={StyleSheet.absoluteFill}
									/>
								</Animated.View>
							</View>

							{/* Page edges — off-white strip on the right, width driven by rotation */}
							<Animated.View
								style={[
									styles.pageEdgeFace,
									{ height: bookHeight, backgroundColor: '#f0ebe0' },
									pageEdgeStyle,
								]}
							>
								{/* Horizontal lines to simulate page edges */}
								{Array.from({ length: 12 }).map((_, i) => (
									<View
										key={i}
										style={[
											styles.pageLine,
											{ top: (bookHeight / 13) * (i + 1) },
										]}
									/>
								))}
								<LinearGradient
									colors={[
										'rgba(0,0,0,0.15)',
										'rgba(0,0,0,0.03)',
										'rgba(255,255,255,0.1)',
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
		backgroundColor: tokens.surface.overlay,
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
	spineFace: {
		position: 'absolute',
		left: 0,
		top: 0,
		zIndex: 0,
		borderTopLeftRadius: 3,
		borderBottomLeftRadius: 3,
		overflow: 'hidden',
	},
	coverFace: {
		position: 'absolute',
		left: 0,
		top: 0,
		zIndex: 1,
	},
	pageEdgeFace: {
		position: 'absolute',
		right: 0,
		top: 0,
		zIndex: 0,
		overflow: 'hidden',
		borderTopRightRadius: 2,
		borderBottomRightRadius: 2,
	},
	pageLine: {
		position: 'absolute',
		left: 2,
		right: 2,
		height: StyleSheet.hairlineWidth,
		backgroundColor: 'rgba(0,0,0,0.06)',
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
