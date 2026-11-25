import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { useFontPref } from '@/lib/font-prefs';
import { headerTitleStyle } from '@/lib/header-title-style';

export default function LibraryLayout() {
	const { fontFamily } = useFontPref();
	return (
		<Stack
			screenOptions={{
				headerLargeTitle: true,
				headerShadowVisible: false,
				headerTitleStyle: headerTitleStyle(fontFamily, Platform.OS),
				headerLargeTitleStyle: { fontFamily },
			}}
		>
			<Stack.Screen name="index" options={{ title: 'Library' }} />
		</Stack>
	);
}
