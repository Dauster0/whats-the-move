import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, font, radius, spacing } from "../lib/theme";
import { USER_INTEREST_SECTIONS } from "../lib/user-interests";
import { useMoveStore } from "../store/move-context";

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
        Pick what you’d really leave the house for.
      </Text>

      {USER_INTEREST_SECTIONS.map((section) => (
        <View key={section.title} style={styles.sectionBlock}>
          <Text style={styles.sectionHeading}>{section.title}</Text>
          <View style={styles.chipGrid}>
            {section.items.map((interest) => {
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
        </View>
      ))}

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
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: font.sizeMd,
    lineHeight: 23,
    color: colors.textSub,
    marginBottom: spacing.lg,
  },
  sectionBlock: {
    marginBottom: spacing.lg,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textSub,
    marginBottom: 10,
    letterSpacing: 0.4,
    textTransform: "uppercase",
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
    backgroundColor: "#F5F0E8",
    borderColor: "#F5F0E8",
  },
  chipText: {
    color: colors.text,
    fontSize: font.sizeSm,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#1C1916",
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