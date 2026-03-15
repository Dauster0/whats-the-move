import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import {
    HiddenSuggestion,
    clearHiddenSuggestions,
    getHiddenSuggestions,
    removeHiddenSuggestion,
} from "../lib/hidden-suggestions-storage";
import { colors, font, radius, spacing } from "../lib/theme";

export default function HiddenMovesScreen() {
  const [hidden, setHidden] = useState<HiddenSuggestion[]>([]);

  async function loadHidden() {
    const data = await getHiddenSuggestions();
    setHidden(data);
  }

  useFocusEffect(
    useCallback(() => {
      loadHidden();
    }, [])
  );

  async function handleRestore(id: string) {
    await removeHiddenSuggestion(id);
    loadHidden();
  }

  function handleClearAll() {
    Alert.alert(
      "Restore all hidden suggestions?",
      "This will allow all hidden suggestions to appear again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore all",
          onPress: async () => {
            await clearHiddenSuggestions();
            loadHidden();
          },
        },
      ]
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Hidden suggestions</Text>
        <View style={{ width: 42 }} />
      </View>

      <Text style={styles.title}>Things you told the app{"\n"}not to show again</Text>
      <Text style={styles.subtitle}>
        You can restore anything here whenever you want.
      </Text>

      {hidden.length > 0 && (
        <Pressable style={styles.clearButton} onPress={handleClearAll}>
          <Text style={styles.clearButtonText}>Restore all hidden suggestions</Text>
        </Pressable>
      )}

      <View style={styles.list}>
        {hidden.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nothing hidden right now</Text>
            <Text style={styles.emptySub}>
              If you ever hide a suggestion, it will show up here so you can bring it back.
            </Text>
          </View>
        ) : (
          hidden.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSub}>
                Hidden on {new Date(item.hiddenAt).toLocaleDateString()}
              </Text>

              <Pressable
                style={styles.restoreButton}
                onPress={() => handleRestore(item.id)}
              >
                <Text style={styles.restoreButtonText}>Restore</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingTop: 64,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
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
  headerTitle: {
    fontSize: font.sizeMd,
    fontWeight: "700",
    color: colors.text,
  },
  title: {
    fontSize: font.sizeXxl,
    lineHeight: 46,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 8,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: font.sizeMd,
    lineHeight: 23,
    color: colors.textSub,
    marginBottom: spacing.lg,
  },
  clearButton: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  clearButtonText: {
    color: colors.textInverse,
    fontSize: font.sizeMd,
    fontWeight: "700",
  },
  list: {
    gap: 12,
  },
  emptyCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  emptyTitle: {
    fontSize: font.sizeLg,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: font.sizeMd,
    color: colors.textSub,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: font.sizeLg,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 6,
  },
  cardSub: {
    fontSize: font.sizeSm,
    color: colors.textMuted,
    marginBottom: 12,
  },
  restoreButton: {
    backgroundColor: colors.bgCardSoft,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  restoreButtonText: {
    color: colors.text,
    fontSize: font.sizeSm,
    fontWeight: "700",
  },
});