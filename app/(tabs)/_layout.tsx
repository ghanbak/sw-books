import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";

import { tokens } from "@/constants/tokens";

// Native tab bar — UIKit on iOS, Material 3 on Android.
//
// On iOS 26+ this becomes the floating Liquid Glass capsule automatically.
// `role="search"` on the scan tab gives it the separated circular affordance
// (like the magnifying glass in Apple News).
//
// On iOS <26 there's no Liquid Glass capsule. UITabBarAppearance layers the
// backgroundEffect (blur) over the backgroundColor, so we disable the blur and
// use a solid color. Critically, iOS applies scrollEdgeAppearance (transparent
// by default) when content is at the top — disableTransparentOnScrollEdge=true
// forces the bar to keep its standard background everywhere.
//
// Icons are SF Symbols on iOS only. Android currently shows tab labels without
// icons — add `androidSrc` PNGs or a VectorIcon family when we ship Android.
const iosMajor =
  Platform.OS === "ios" ? Number.parseInt(String(Platform.Version), 10) : 0;
const isIOS26Plus = iosMajor >= 26;

export default function TabLayout() {
  return (
    <NativeTabs
      blurEffect={isIOS26Plus ? "systemChromeMaterialDark" : "none"}
      backgroundColor={isIOS26Plus ? undefined : tokens.surface.background}
      disableTransparentOnScrollEdge={!isIOS26Plus}
    >
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
