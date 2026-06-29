import { Stack } from "expo-router";

import { TabHeaderActions } from "@/components/tab-header-actions";
import { useFontPref } from "@/lib/font-prefs";
import { ScrollView, Text, View } from "react-native";

export default function LibraryLayout() {
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
        options={{
          title: "Library",
          headerRight: () => <TabHeaderActions showFilter />,
        }}
      />
    </Stack>
  );
}
