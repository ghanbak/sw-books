import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";

// Native tab bar — UIKit on iOS, Material 3 on Android.
//
// On iOS 26+ this becomes the floating Liquid Glass capsule automatically.
// `role="search"` on the scan tab gives it the separated circular affordance
// (like the magnifying glass in Apple News). `role="bookmarks"` is a semantic
// hint for the user's saved-books shelf.
//
// Icons are SF Symbols on iOS only. Android currently shows tab labels without
// icons — add `androidSrc` PNGs or a VectorIcon family when we ship Android.
export default function TabLayout() {
  return (
    <NativeTabs blurEffect="systemChromeMaterialDark">
      <NativeTabs.Trigger name="index">
        <Icon
          sf={{ default: "externaldrive", selected: "externaldrive.fill" }}
        />
        <Label>Archives</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="shelf">
        <Icon
          sf={{ default: "books.vertical", selected: "books.vertical.fill" }}
        />
        <Label>Shelves</Label>
      </NativeTabs.Trigger>

      {/* biome-ignore lint/a11y/useSemanticElements: NativeTabsTabBarItemRole, not ARIA */}
      <NativeTabs.Trigger name="scan" role="search">
        <Icon sf="barcode.viewfinder" />
        <Label>Scan</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <Icon
          sf={{
            default: "person.crop.circle",
            selected: "person.crop.circle.fill",
          }}
        />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
