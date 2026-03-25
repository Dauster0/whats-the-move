import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  SuggestionFeedback,
  getSuggestionFeedback,
} from "../lib/feedback-storage";
import {
  HiddenSuggestion,
  getHiddenSuggestions,
} from "../lib/hidden-suggestions-storage";
import { useThemeColors } from "../hooks/use-theme-colors";
import { font, getColors, radius, spacing } from "../lib/theme";
import { useMoveStore } from "../store/move-context";

function formatCategory(category: string) {
  if (category === "micro") return "Quick reset";
  if (category === "short") return "Real-world";
  return "Social";
}

function isThisWeek(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return date >= weekAgo;
}

export default function WeeklyReportScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { completedMoves, clearMoves, isLoaded } = useMoveStore();
  const [feedback, setFeedback] = useState<SuggestionFeedback[]>([]);
  const [hidden, setHidden] = useState<HiddenSuggestion[]>([]);

  useEffect(() => {
    async function loadExtra() {
      setFeedback(await getSuggestionFeedback());
      setHidden(await getHiddenSuggestions());
    }
    loadExtra();
  }, []);

  const weekMoves = useMemo(
    () => completedMoves.filter((m) => isThisWeek(m.completedAt)),
    [completedMoves]
  );

  const totalCompleted = weekMoves.length;

  const liked = feedback.filter((f) => f.value === "liked");
  const disliked = feedback.filter((f) => f.value === "disliked");

  const categoryCounts = weekMoves.reduce(
    (acc, move) => {
      acc[move.category] += 1;
      return acc;
    },
    { micro: 0, short: 0, social: 0 }
  );

  const bestCategoryLabel =
    categoryCounts.short >= categoryCounts.micro &&
    categoryCounts.short >= categoryCounts.social
      ? "Real-world"
      : categoryCounts.social >= categoryCounts.micro
      ? "Social"
      : "Quick reset";

  const topMove =
    weekMoves.length > 0
      ? Object.entries(
          weekMoves.reduce<Record<string, number>>((acc, move) => {
            acc[move.move] = (acc[move.move] ?? 0) + 1;
            return acc;
          }, {})
        ).sort((a, b) => b[1] - a[1])[0]?.[0]
      : null;

  const whatWorkedRows = useMemo(() => {
    const rows: { label: string; value: string }[] = [];
    if (weekMoves.length > 0) {
      rows.push({ label: "Best category", value: bestCategoryLabel });
    }
    if (liked.length > 0) {
      rows.push({ label: "Liked suggestions", value: String(liked.length) });
    }
    if (disliked.length > 0) {
      rows.push({ label: "Disliked suggestions", value: String(disliked.length) });
    }
    if (hidden.length > 0) {
      rows.push({ label: "Hidden suggestions", value: String(hidden.length) });
    }
    if (weekMoves.length >= 2 && topMove) {
      rows.push({ label: "Most repeated move", value: topMove });
    } else if (weekMoves.length === 1) {
      rows.push({ label: "Move this week", value: weekMoves[0].move });
    }
    return rows;
  }, [
    weekMoves,
    bestCategoryLabel,
    liked.length,
    disliked.length,
    hidden.length,
    topMove,
  ]);

  if (!isLoaded) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.push("/")}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.weekLabel}>This week</Text>
      </View>

      <Text style={styles.title}>Weekly{"\n"}Report</Text>

      <View style={styles.heroCard}>
        {totalCompleted === 0 ? (
          <>
            <Text style={styles.heroEmptyTitle}>This week</Text>
            <Text style={styles.heroEmptyBody}>
              Your moves will show up here. The more you use it, the better the picks get.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.heroNumber}>{totalCompleted}</Text>
            <Text style={styles.heroLabel}>
              move{totalCompleted !== 1 ? "s" : ""} done this week
            </Text>
          </>
        )}
      </View>

      {whatWorkedRows.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>What worked</Text>
          <View style={styles.infoCard}>
            {whatWorkedRows.map((row) => (
              <View key={row.label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{row.label}</Text>
                <Text style={styles.infoValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Move history</Text>

        {completedMoves.length === 0 ? (
          <Text style={styles.emptyText}>No completed moves yet.</Text>
        ) : (
          <View style={styles.historyList}>
            {completedMoves.map((move, index) => (
              <Pressable
                key={`${move.completedAt}-${index}`}
                style={({ pressed }) => [
                  styles.historyItem,
                  pressed && styles.historyItemPressed,
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/move-detail",
                    params: {
                      title: move.move,
                      subtitle: "",
                      reason: `${formatCategory(move.category)} move you completed.`,
                      durationMinutes: String(move.durationMinutes ?? 5),
                      sourceName: move.move,
                      address: "",
                      mapQuery: move.move,
                      externalUrl: "",
                      distanceText: "",
                      priceText: "",
                      actionType: "maps",
                      category: move.category,
                    },
                  })
                }
              >
                <View style={styles.historyLeft}>
                  <Text style={styles.historyMove}>{move.move}</Text>
                  <Text style={styles.historyMeta}>
                    {formatCategory(move.category)} · {move.durationMinutes ?? 5} min
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <Pressable
        style={styles.primaryButton}
        onPress={() => router.push("/hidden-moves")}
      >
        <Text style={styles.primaryButtonText}>Manage hidden suggestions</Text>
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={clearMoves}>
        <Text style={styles.secondaryButtonText}>Reset completed move data</Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles(colors: ReturnType<typeof getColors>) {
  return StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: font.sizeMd,
    color: colors.textMuted,
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
    gap: 14,
  },
  backBtn: {
    width: 42,
    height: 42,
    backgroundColor: colors.bgCard,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  backArrow: {
    fontSize: font.sizeLg,
    color: colors.text,
    fontWeight: "600",
  },
  weekLabel: {
    fontSize: font.sizeXs,
    color: colors.textMuted,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    fontSize: font.sizeHero,
    fontWeight: "800",
    color: colors.text,
    lineHeight: 56,
    letterSpacing: -2,
    marginBottom: spacing.lg,
  },
  heroCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.md + 4,
    marginBottom: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  heroNumber: {
    fontSize: font.sizeHero,
    fontWeight: "800",
    color: colors.accent,
    letterSpacing: -3,
    lineHeight: 60,
  },
  heroLabel: {
    fontSize: font.sizeMd,
    color: colors.textSub,
    fontWeight: "600",
    marginTop: 4,
  },
  heroEmptyTitle: {
    fontSize: font.sizeMd,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  heroEmptyBody: {
    fontSize: font.sizeMd,
    color: colors.textMuted,
    lineHeight: 24,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: font.sizeXs,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  infoCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 12,
  },
  infoRow: {
    gap: 4,
  },
  infoLabel: {
    fontSize: font.sizeXs,
    color: colors.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  infoValue: {
    fontSize: font.sizeMd,
    color: colors.text,
    fontWeight: "700",
  },
  historyList: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: "hidden",
  },
  historyItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyItemPressed: {
    backgroundColor: colors.bgCardSoft,
  },
  historyLeft: {
    flex: 1,
  },
  historyMove: {
    fontSize: font.sizeMd,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  historyMeta: {
    fontSize: font.sizeXs,
    color: colors.textMuted,
    fontWeight: "500",
  },
  emptyText: {
    fontSize: font.sizeMd,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  primaryButton: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryButtonText: {
    color: colors.textInverse,
    fontSize: font.sizeMd,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: font.sizeMd,
    fontWeight: "700",
  },
  });
}