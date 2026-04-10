import { Tabs } from 'expo-router';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
	const colorScheme = useColorScheme();

	return (
		<Tabs
			screenOptions={{
				tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
				headerShown: true,
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
