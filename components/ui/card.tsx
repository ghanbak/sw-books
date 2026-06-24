import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { tokens } from "@/constants/tokens";

/**
 * The dark card shell used by book rows, the book-detail grouping cards, and the
 * account card. The skeuomorphic `CardNotch` "datapad" footer (light bars + a
 * notched tab) is rendered at the bottom unless `notch={false}`.
 *
 * Geometry is a faithful approximation of Figma node 130:394 and is refined when
 * the cards are wired up against the design.
 */
export function Card({
  children,
  style,
  notch = true,
}: {
  children: ReactNode;
  style?: ViewStyle;
  notch?: boolean;
}) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.body}>{children}</View>
      {notch && <CardNotch />}
    </View>
  );
}

/** The datapad notch strip: accent "light bars" on the left, a notched tab on the right. */
export function CardNotch() {
  return (
    <View style={styles.notchStrip}>
      <View style={styles.lightBars}>
        <View style={[styles.bar, { width: 32 }]} />
        <View style={[styles.bar, { width: 8 }]} />
      </View>
      <View style={styles.notchTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.surface.card,
    borderRadius: 12,
    borderWidth: 0,
    overflow: "hidden",
  },
  body: {
    padding: 12,
  },
  notchStrip: {
    height: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingRight: 24,
  },
  lightBars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  bar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.border.subtle,
  },
  notchTab: {
    width: 88,
    height: 12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 0,
    borderBottomWidth: 0,
    borderColor: tokens.border.subtle,
    backgroundColor: tokens.surface.background,
  },
});
