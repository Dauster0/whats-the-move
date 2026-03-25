import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../hooks/use-theme-colors";
import { setConciergeDetailPayload } from "../lib/concierge-detail-storage";
import {
  getSavedConciergeMoves,
  removeSavedConciergeMove,
  type SavedConciergeMove,
} from "../lib/saved-concierge-storage";
import { font, radius, spacing } from "../lib/theme";

export default function SavedMovesScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState<SavedConciergeMove[]>([]);

  async function load() {
    setItems(await getSavedConciergeMoves());
  }

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [])
  );

  function confirmRemove(entry: SavedConciergeMove) {
    Alert.alert("Remove?", `Remove “${entry.suggestion.title}” from saved?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await removeSavedConciergeMove(entry.id);
          void load();
        },
      },
    ]);
  }

  async function openMove(entry: SavedConciergeMove) {
    await setConciergeDetailPayload({
      suggestion: entry.suggestion,
      others: [],
    });
    router.push("/concierge-detail");
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Saved moves</Text>
        <View style={{ width: 42 }} />
      </View>

      <Text style={styles.subtitle}>
        Concierge picks you bookmarked. Tap to open full detail.
      </Text>

      {items.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: colors.border }]}>
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Open a suggestion, then tap the bookmark on the detail screen.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((entry) => (
            <View
              key={entry.id}
              style={[styles.card, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
            >
              <View style={styles.cardRow}>
                <Pressable style={styles.cardMain} onPress={() => void openMove(entry)}>
                  {entry.suggestion.photoUrl ? (
                    <Image
                      source={{ uri: entry.suggestion.photoUrl }}
                      style={styles.thumb}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: colors.bgMuted }]} />
                  )}
                  <View style={styles.cardText}>
                    <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
                      {entry.suggestion.title}
                    </Text>
                    {entry.suggestion.category ? (
                      <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                        {entry.suggestion.category}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  style={styles.trashBtn}
                  onPress={() => confirmRemove(entry)}
                  hitSlop={12}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { paddingHorizontal: spacing.md },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    backBtn: { width: 42, paddingVertical: 4 },
    backArrow: { fontSize: 24, color: colors.text, fontWeight: "600" },
    headerTitle: { fontSize: font.sizeLg, fontWeight: "800", color: colors.text },
    subtitle: {
      fontSize: font.sizeSm,
      color: colors.textMuted,
      lineHeight: 20,
      marginBottom: spacing.lg,
    },
    emptyCard: {
      padding: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    emptyTitle: { fontSize: font.sizeMd, fontWeight: "800", color: colors.text, marginBottom: 6 },
    emptySub: { fontSize: font.sizeSm, lineHeight: 20 },
    list: { gap: spacing.sm },
    card: {
      borderRadius: radius.md,
      borderWidth: 1,
      overflow: "hidden",
    },
    cardRow: { flexDirection: "row", alignItems: "stretch" },
    cardMain: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.sm,
      gap: spacing.sm,
      minWidth: 0,
    },
    thumb: { width: 56, height: 56, borderRadius: radius.sm },
    cardText: { flex: 1, minWidth: 0 },
    cardTitle: { fontSize: font.sizeMd, fontWeight: "700" },
    cardMeta: { fontSize: 12, marginTop: 2 },
    trashBtn: {
      justifyContent: "center",
      paddingHorizontal: spacing.sm,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: colors.border,
    },
  });
}
