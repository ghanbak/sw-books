import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { BookOpen, Library, ScanBarcode, User } from 'lucide-react-native';

import { HapticTab } from '@/components/haptic-tab';
import { tokens } from '@/constants/tokens';

export default function TabLayout() {
	return (
		<Tabs
			screenOptions={{
				tabBarActiveTintColor: tokens.accent.primary,
				tabBarInactiveTintColor: tokens.text.hint,
				tabBarStyle: Platform.select({
					// iOS 26: let Liquid Glass show through — no opaque background
					ios: {
						position: 'absolute',
						borderTopWidth: 0,
					},
					// Android: keep dark surface
					default: {
						backgroundColor: tokens.surface.background,
						borderTopColor: tokens.border.subtle,
					},
				}),
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
					title: 'Catalog',
					tabBarIcon: ({ color, size }) => <BookOpen size={size} color={color} />,
				}}
			/>
			<Tabs.Screen
				name="shelf"
				options={{
					title: 'Bookshelf',
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
