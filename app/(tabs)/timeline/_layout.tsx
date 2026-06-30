import { Stack } from 'expo-router';

import { useFontPref } from '@/lib/font-prefs';

export default function TimelineLayout() {
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
			<Stack.Screen name="index" options={{ title: 'Timeline' }} />
		</Stack>
	);
}
