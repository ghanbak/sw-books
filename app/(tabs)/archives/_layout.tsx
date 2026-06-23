import { Stack } from 'expo-router';

import { TabHeaderActions } from '@/components/tab-header-actions';

export default function ArchivesLayout() {
	return (
		<Stack screenOptions={{ headerLargeTitle: true, headerShadowVisible: false }}>
			<Stack.Screen
				name="index"
				options={{ title: 'Archives', headerRight: () => <TabHeaderActions showFilter /> }}
			/>
		</Stack>
	);
}
