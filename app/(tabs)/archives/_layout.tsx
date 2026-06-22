import { Stack } from 'expo-router';

import { TabHeaderActions } from '@/components/tab-header-actions';
import { tokens } from '@/constants/tokens';

export default function ArchivesLayout() {
	return (
		<Stack
			screenOptions={{
				headerLargeTitle: true,
				headerShadowVisible: false,
				headerStyle: { backgroundColor: tokens.surface.background },
				headerLargeStyle: { backgroundColor: tokens.surface.background },
				headerTintColor: tokens.text.primary,
			}}
		>
			<Stack.Screen
				name="index"
				options={{ title: 'Archives', headerRight: () => <TabHeaderActions showFilter /> }}
			/>
		</Stack>
	);
}
