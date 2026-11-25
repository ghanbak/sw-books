import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { useFontPref } from '@/lib/font-prefs';
import { headerTitleStyle } from '@/lib/header-title-style';

function getIOSVersion(): number {
	if (Platform.OS !== 'ios') return 0;

	return Number.parseInt(Platform.Version as string, 10);
}

function isIOS26OrLater(): boolean {
	return getIOSVersion() >= 26;
}

export default function ArchivesLayout() {
	const { fontFamily } = useFontPref();
	return (
		<Stack
			screenOptions={{
				headerLargeTitle: true,
				headerShadowVisible: false,
				headerTitleStyle: headerTitleStyle(fontFamily, Platform.OS),
				headerLargeTitleStyle: { fontFamily },
				headerTransparent: Platform.OS === 'ios',
				headerBlurEffect: isIOS26OrLater() ? undefined : 'regular',
			}}
		>
			<Stack.Screen name="index" options={{ title: 'Archives' }} />
		</Stack>
	);
}
