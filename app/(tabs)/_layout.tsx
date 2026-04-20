import { Tabs } from 'expo-router';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { tokens } from '@/constants/tokens';

export default function TabLayout() {
	return (
		<Tabs
			screenOptions={{
				tabBarActiveTintColor: tokens.accent.primary,
				tabBarInactiveTintColor: tokens.text.hint,
				tabBarStyle: {
					backgroundColor: tokens.surface.background,
					borderTopColor: tokens.border.subtle,
				},
				headerStyle: {
					backgroundColor: tokens.surface.background,
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
					tabBarIcon: ({ color }) => <IconSymbol size={28} name="book.fill" color={color} />,
				}}
			/>
			<Tabs.Screen
				name="shelf"
				options={{
					title: 'Bookshelf',
					tabBarIcon: ({ color }) => (
						<IconSymbol size={28} name="books.vertical.fill" color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="scan"
				options={{
					title: 'Scan',
					headerShown: false,
					tabBarIcon: ({ color }) => (
						<IconSymbol size={28} name="barcode.viewfinder" color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="profile"
				options={{
					title: 'Profile',
					tabBarIcon: ({ color }) => (
						<IconSymbol size={28} name="person.fill" color={color} />
					),
				}}
			/>
		</Tabs>
	);
}
