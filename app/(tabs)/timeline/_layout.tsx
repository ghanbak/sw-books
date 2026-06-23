import { Stack } from 'expo-router';

import { TabHeaderActions } from '@/components/tab-header-actions';

export default function TimelineLayout() {
	return (
		<Stack screenOptions={{ headerLargeTitle: true, headerShadowVisible: false }}>
			<Stack.Screen
				name="index"
				options={{ title: 'Timeline', headerRight: () => <TabHeaderActions /> }}
			/>
		</Stack>
	);
}
