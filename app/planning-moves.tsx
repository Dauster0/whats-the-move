import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../hooks/use-theme-colors";
import { setConciergeDetailPayload } from "../lib/concierge-detail-storage";
import { usePlusEntitlements } from "../store/plus-context";
import {
  getPlanningConciergeMoves,
  type PlanningConciergeMove,
} from "../lib/planning-moves-storage";
import { font, radius, spacing } from "../lib/theme";
export default function PlanningMovesScreen() {
  const colors = useThemeColors();
  const { isPlus, loaded: plusLoaded } = usePlusEntitlements();
  const [rows, setRows] = useState<PlanningConciergeMove[]>([]);

  const load = useCallback(() => {
    void getPlanningConciergeMoves().then(setRows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isPlus) load();
    }, [load, isPlus])
  );

  if (!plusLoaded) {
    return (
      <View style={[styles.scroll, { backgroundColor: colors.bg, justifyContent: "center", padding: spacing.lg }]}>
        <Text style={{ color: colors.textMuted, textAlign: "center" }}>One sec.</Text>
      </View>
    );
  }

  if (!isPlus) {
    return (
      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.back, { color: colors.text }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Planning</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          A Plus-only list for events you want to catch later — from Coming up, not today’s deck.
        </Text>
        <Pressable
          style={[styles.cta, { backgroundColor: colors.accent }]}
          onPress={() => router.push("/elsewhere-plus?source=planning" as Href)}
        >
          <Text style={[styles.ctaText, { color: colors.textInverse }]}>Start free trial</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Pressable style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
        <Text style={[styles.back, { color: colors.text }]}>← Back</Text>
      </Pressable>
      <Text style={[styles.title, { color: colors.text }]}>Planning</Text>
      <Text style={[styles.sub, { color: colors.textMuted }]}>
        Moves you swiped right on from Coming up — for a future day, not right now.
      </Text>

      {rows.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          Nothing here yet. Open Coming up and swipe right on something you’re into.
        </Text>
      ) : (
        rows.map((row) => (
          <Pressable
            key={row.id}
            style={[styles.row, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
            onPress={async () => {
              await setConciergeDetailPayload({ suggestion: row.suggestion, others: [] });
              router.push("/concierge-detail");
            }}
          >
            {row.suggestion.photoUrl ? (
              <Image
                source={{ uri: row.suggestion.photoUrl }}
                style={styles.thumb}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.thumb, { backgroundColor: colors.bgMuted }]} />
            )}
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={2}>
                {row.suggestion.title}
              </Text>
              {row.suggestion.dateBadge ? (
                <Text style={[styles.badge, { color: colors.accent }]}>{row.suggestion.dateBadge}</Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.md, paddingTop: 56, paddingBottom: spacing.xxl },
  backRow: { marginBottom: spacing.md },
  back: { fontSize: font.sizeMd, fontWeight: "600" },
  title: { fontSize: font.sizeXxl, fontWeight: "800", marginBottom: 6 },
  sub: { fontSize: font.sizeSm, lineHeight: 20, marginBottom: spacing.lg },
  empty: { fontSize: font.sizeSm, marginTop: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  thumb: { width: 52, height: 52, borderRadius: radius.sm },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: font.sizeMd, fontWeight: "700" },
  badge: { fontSize: 12, fontWeight: "700", marginTop: 4 },
  cta: {
    marginTop: spacing.lg,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
  },
  ctaText: { fontSize: 16, fontWeight: "800" },
});
