import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { tokens } from '@/constants/tokens';

// Native tab bar — UIKit on iOS, Material 3 on Android.
//
// Tabs: Archives · Timeline · Library · Search. Search uses `role="search"` for
// the separated circular affordance (like Apple News). Scan and Profile are no
// longer tabs — they open as a full-screen modal / bottom sheet from each tab's
// header action buttons.
//
// On iOS 26+ this becomes the floating Liquid Glass capsule automatically. On
// iOS <26 we disable the blur and use a solid color, and force the standard
// background everywhere via disableTransparentOnScrollEdge.
//
// Icons are SF Symbols on iOS only. Android currently shows tab labels without
// icons — add `androidSrc` PNGs or a VectorIcon family when we ship Android.
const iosMajor = Platform.OS === 'ios' ? Number.parseInt(String(Platform.Version), 10) : 0;
const isIOS26Plus = iosMajor >= 26;

export default function TabLayout() {
	return (
		<NativeTabs
			blurEffect={isIOS26Plus ? 'systemChromeMaterialDark' : 'none'}
			backgroundColor={isIOS26Plus ? undefined : tokens.surface.background}
			disableTransparentOnScrollEdge={!isIOS26Plus}
		>
			<NativeTabs.Trigger name="archives">
				<Icon sf={{ default: 'archivebox', selected: 'archivebox.fill' }} />
				<Label>Archives</Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="timeline">
				<Icon sf={{ default: 'clock', selected: 'clock.fill' }} />
				<Label>Timeline</Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="library">
				<Icon sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }} />
				<Label>Library</Label>
			</NativeTabs.Trigger>

			{/* biome-ignore lint/a11y/useSemanticElements: NativeTabsTabBarItemRole, not ARIA */}
			<NativeTabs.Trigger name="search" role="search">
				<Icon sf="magnifyingglass" />
				<Label>Search</Label>
			</NativeTabs.Trigger>
		</NativeTabs>
	);
}
