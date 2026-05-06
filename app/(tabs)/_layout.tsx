import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { BookOpen, Library, ScanBarcode, User } from 'lucide-react-native';

import { HapticTab } from '@/components/haptic-tab';
import { tokens } from '@/constants/tokens';

// iOS 26+: Liquid Glass material behind the tab items.
// Older iOS / Android: opaque dark surface.
function TabBarBackground() {
	if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
		return <GlassView style={StyleSheet.absoluteFill} />;
	}
	return <View style={[StyleSheet.absoluteFill, { backgroundColor: tokens.surface.background }]} />;
}

export default function TabLayout() {
	return (
		<Tabs
			screenOptions={{
				tabBarActiveTintColor: tokens.accent.primary,
				tabBarInactiveTintColor: tokens.text.hint,
				tabBarStyle: Platform.select({
					ios: {
						position: 'absolute',
						borderTopWidth: 0,
						backgroundColor: 'transparent',
					},
					default: {
						backgroundColor: tokens.surface.background,
						borderTopColor: tokens.border.subtle,
					},
				}),
				tabBarBackground: () => <TabBarBackground />,
				headerStyle: {
					backgroundColor: Platform.OS === 'ios' ? 'transparent' : tokens.surface.background,
				},
				headerTintColor: tokens.text.primary,
				headerShadowVisible: false,
				tabBarButton: HapticTab,
			}}
		>
			<Tabs.Screen
				name="index"
				options={{
					title: 'Archives',
					tabBarIcon: ({ color, size }) => <BookOpen size={size} color={color} />,
				}}
			/>
			<Tabs.Screen
				name="shelf"
				options={{
					title: 'Shelves',
					tabBarIcon: ({ color, size }) => <Library size={size} color={color} />,
				}}
			/>
			<Tabs.Screen
				name="scan"
				options={{
					title: 'Scan',
					headerShown: false,
					tabBarIcon: ({ color, size }) => <ScanBarcode size={size} color={color} />,
				}}
			/>
			<Tabs.Screen
				name="profile"
				options={{
					title: 'Profile',
					tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
				}}
			/>
		</Tabs>
	);
}
