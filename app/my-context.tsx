import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useThemeColors } from "../hooks/use-theme-colors";
import { font, radius, spacing } from "../lib/theme";
import type { UserPreferences } from "../store/move-context";
import { useMoveStore } from "../store/move-context";

const AGE_OPTIONS: UserPreferences["ageRange"][] = [
  "under18",
  "18-21",
  "18-24",
  "25-34",
  "35-44",
  "45+",
  "prefer_not",
];

const BATTERY: UserPreferences["socialBattery"][] = [
  "introvert",
  "ambivert",
  "extrovert",
];

const TRANSPORT_OPTIONS: { key: UserPreferences["transportMode"]; label: string }[] = [
  { key: "walking", label: "Walking" },
  { key: "cycling", label: "Cycling" },
  { key: "transit", label: "Transit" },
  { key: "driving", label: "Driving" },
];

export default function MyContextScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { preferences, setPreferences } = useMoveStore();

  const [homeCity, setHomeCity] = useState(preferences.homeCity ?? "");
  const [schoolOrWork, setSchoolOrWork] = useState(preferences.schoolOrWork ?? "");
  const [ageRange, setAgeRange] = useState<UserPreferences["ageRange"]>(
    preferences.ageRange ?? "prefer_not"
  );
  const [socialBattery, setSocialBattery] = useState<UserPreferences["socialBattery"]>(
    preferences.socialBattery ?? "ambivert"
  );
  const [transportMode, setTransportMode] = useState<UserPreferences["transportMode"]>(
    preferences.transportMode ?? "driving"
  );

  function save() {
    setPreferences({
      ...preferences,
      homeCity: homeCity.trim(),
      schoolOrWork: schoolOrWork.trim(),
      ageRange,
      socialBattery,
      transportMode,
    });
    router.back();
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>Your context</Text>
      <Text style={styles.subtitle}>
        Used to tune suggestions and booking search. Everything stays on this device.
      </Text>

      <Text style={styles.fieldLabel}>Home neighborhood or city</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Silver Lake, Austin, near campus…"
        placeholderTextColor={colors.textMuted}
        value={homeCity}
        onChangeText={setHomeCity}
        autoCapitalize="words"
      />

      <Text style={styles.fieldLabel}>School or work area (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. UCLA, downtown office…"
        placeholderTextColor={colors.textMuted}
        value={schoolOrWork}
        onChangeText={setSchoolOrWork}
        autoCapitalize="words"
      />

      <Text style={styles.fieldLabel}>Age range</Text>
      <View style={styles.chipGrid}>
        {AGE_OPTIONS.map((opt) => {
          const active = ageRange === opt;
          const label =
            opt === "prefer_not"
              ? "Prefer not to say"
              : opt === "under18"
                ? "Under 18"
                : opt;
          return (
            <Pressable
              key={opt}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setAgeRange(opt)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.fieldLabel}>Social battery</Text>
      <Text style={styles.hint}>
        Introverts get fewer “text a friend” nudges; extroverts get a few more.
      </Text>
      <View style={styles.rowChoice}>
        {BATTERY.map((b) => {
          const active = socialBattery === b;
          return (
            <Pressable
              key={b}
              style={[styles.choice, active && styles.choiceActive]}
              onPress={() => setSocialBattery(b)}
            >
              <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{b}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.fieldLabel}>How do you get around?</Text>
      <View style={styles.chipGrid}>
        {TRANSPORT_OPTIONS.map(({ key, label }) => {
          const active = transportMode === key;
          return (
            <Pressable
              key={key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setTransportMode(key)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.fieldLabel}>Budget & energy</Text>
      <Text style={styles.muted}>
        Set in onboarding or tweak via the same flows as before — budget is {preferences.budget},
        energy {preferences.energyMode}. Edit interests from the home screen.
      </Text>

      <Pressable style={styles.primaryButton} onPress={save}>
        <Text style={styles.primaryButtonText}>Save</Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: {
      paddingTop: 56,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xxl,
    },
    header: { marginBottom: spacing.sm },
    backBtn: { alignSelf: "flex-start", padding: spacing.xs },
    backArrow: { fontSize: 28, color: colors.text, fontWeight: "600" },
    title: {
      fontSize: font.sizeXxl,
      fontWeight: "800",
      color: colors.text,
      marginBottom: spacing.sm,
    },
    subtitle: {
      fontSize: font.sizeMd,
      color: colors.textSub,
      lineHeight: 23,
      marginBottom: spacing.lg,
    },
    fieldLabel: {
      fontSize: font.sizeSm,
      fontWeight: "700",
      color: colors.textMuted,
      marginBottom: spacing.xs,
      marginTop: spacing.md,
    },
    hint: {
      fontSize: font.sizeSm,
      color: colors.textMuted,
      marginBottom: spacing.sm,
    },
    muted: {
      fontSize: font.sizeSm,
      color: colors.textSub,
      lineHeight: 20,
    },
    input: {
      backgroundColor: colors.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
      paddingHorizontal: spacing.md,
      fontSize: font.sizeMd,
      color: colors.text,
    },
    chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      backgroundColor: colors.bgCard,
      borderRadius: radius.full,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    chipActive: {
      backgroundColor: colors.bgDark,
      borderColor: colors.bgDark,
    },
    chipText: { fontSize: font.sizeSm, fontWeight: "600", color: colors.text },
    chipTextActive: { color: colors.textInverse },
    rowChoice: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    choice: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.bgCard,
    },
    choiceActive: {
      backgroundColor: colors.bgDark,
      borderColor: colors.bgDark,
    },
    choiceText: { fontSize: font.sizeSm, fontWeight: "700", color: colors.text },
    choiceTextActive: { color: colors.textInverse },
    primaryButton: {
      backgroundColor: colors.bgDark,
      borderRadius: radius.lg,
      paddingVertical: 18,
      alignItems: "center",
      marginTop: spacing.xl,
    },
    primaryButtonText: {
      color: colors.textInverse,
      fontSize: font.sizeMd,
      fontWeight: "700",
    },
  });
}
