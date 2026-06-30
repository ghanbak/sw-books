import { Stack } from 'expo-router';
import { Platform } from 'react-native';

function getIOSVersion(): number {
	if (Platform.OS !== 'ios') return 0;

	return Number.parseInt(Platform.Version as string, 10);
}

function isIOS26OrLater(): boolean {
	return getIOSVersion() >= 26;
}

export default function ArchivesLayout() {
	return (
		<Stack>
			<Stack.Screen
				name="index"
				options={{
					title: 'Archives',
					headerLargeTitle: true,
					headerTransparent: Platform.OS === 'ios',
					headerBlurEffect: isIOS26OrLater() ? undefined : 'regular',
				}}
			/>
		</Stack>
	);
}
