import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";

// Native tab bar — UIKit on iOS, Material 3 on Android. No custom styling: the
// system renders its default (the floating Liquid Glass capsule on iOS 26+).
//
// Tabs: Archives · Timeline · Library · Search. Search uses `role="search"` for
// the separated circular affordance (like Apple News). Scan and Profile are no
// longer tabs — they open as a full-screen modal / bottom sheet from each tab's
// header action buttons.
//
// Icons are SF Symbols on iOS only. Android currently shows tab labels without
// icons — add `androidSrc` PNGs or a VectorIcon family when we ship Android.

export default function TabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="archives">
        <Icon sf={{ default: "pyramid", selected: "pyramid.fill" }} />
        <Label>Archives</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="timeline">
        <Icon
          sf={{
            default: "lines.measurement.horizontal",
            selected: "lines.measurement.horizontal",
          }}
        />
        <Label>Timeline</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="library">
        <Icon
          sf={{ default: "rectangle.stack", selected: "rectangle.stack.fill" }}
        />
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
