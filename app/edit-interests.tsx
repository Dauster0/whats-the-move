import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, font, radius, spacing } from "../lib/theme";
import { useMoveStore } from "../store/move-context";

const ALL_INTERESTS = [
  { key: "walking", label: "Walking" },
  { key: "coffee", label: "Coffee" },
  { key: "dessert", label: "Dessert" },
  { key: "exploring", label: "Exploring" },
  { key: "bookstores", label: "Bookstores" },
  { key: "museums", label: "Museums" },
  { key: "movies", label: "Movies" },
  { key: "comedy", label: "Comedy" },
  { key: "nightlife", label: "Nightlife" },
  { key: "sports", label: "Sports" },
  { key: "working out", label: "Working out" },
  { key: "beach", label: "Beach" },
  { key: "journaling", label: "Journaling" },
  { key: "reading", label: "Reading" },
  { key: "calling friends", label: "Calling friends" },
  { key: "solo-recharge", label: "Solo recharge" },
  { key: "cheap-hangouts", label: "Cheap hangouts" },
];

export default function EditInterestsScreen() {
  const { preferences, setPreferences } = useMoveStore();
  const [selected, setSelected] = useState<string[]>(preferences.interests);

  function toggleInterest(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((i) => i !== key) : [...prev, key]
    );
  }

  function save() {
    setPreferences({
      ...preferences,
      interests: selected,
    });
    router.back();
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>Edit interests</Text>
      <Text style={styles.subtitle}>
        Choose the things that actually sound good in real life.
      </Text>

      <View style={styles.chipGrid}>
        {ALL_INTERESTS.map((interest) => {
          const active = selected.includes(interest.key);

          return (
            <Pressable
              key={interest.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => toggleInterest(interest.key)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {interest.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.countText}>{selected.length} selected</Text>

      <Pressable style={styles.saveButton} onPress={save}>
        <Text style={styles.saveButtonText}>Save changes</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingTop: 64,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
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
    alignSelf: "flex-start",
  },
  backArrow: {
    fontSize: font.sizeLg,
    color: colors.text,
    fontWeight: "600",
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
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.bgDark,
    borderColor: colors.bgDark,
  },
  chipText: {
    color: colors.text,
    fontSize: font.sizeSm,
    fontWeight: "700",
  },
  chipTextActive: {
    color: colors.textInverse,
  },
  countText: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    fontSize: font.sizeSm,
    color: colors.textMuted,
    fontWeight: "600",
  },
  saveButton: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: "center",
  },
  saveButtonText: {
    color: colors.textInverse,
    fontSize: font.sizeMd,
    fontWeight: "700",
  },
});