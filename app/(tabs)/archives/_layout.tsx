import { Stack } from 'expo-router';

import { TabHeaderActions } from '@/components/tab-header-actions';
import { useFontPref } from '@/lib/font-prefs';

export default function ArchivesLayout() {
	const { fontFamily } = useFontPref();
	return (
		<Stack
			screenOptions={{
				headerLargeTitle: true,
				headerShadowVisible: false,
				headerTitleStyle: { fontFamily },
				headerLargeTitleStyle: { fontFamily },
			}}
		>
			<Stack.Screen
				name="index"
				options={{ title: 'Archives', headerRight: () => <TabHeaderActions showFilter /> }}
			/>
		</Stack>
	);
}
