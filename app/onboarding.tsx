import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useThemeColors } from "../hooks/use-theme-colors";
import { font, radius, spacing } from "../lib/theme";
import { USER_INTEREST_SECTIONS } from "../lib/user-interests";
import { UserPreferences, useMoveStore } from "../store/move-context";

const STEPS = [
  "Find something to do in one tap.",
  "What sounds good?",
  "How do you usually want to spend time?",
  "When are you most likely to actually go?",
];

const TIME_OPTIONS = ["morning", "midday", "afternoon", "evening", "night"] as const;

export default function OnboardingScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { setPreferencesAndFinishOnboarding } = useMoveStore();

  const [step, setStep] = useState(0);
  const [preferences, setPreferences] = useState<UserPreferences>({
    interests: [],
    socialMode: "both",
    budget: "cheap",
    energyMode: "mixed",
    placeMode: "both",
    preferredTimes: ["morning", "midday", "afternoon", "evening", "night"],
    homeCity: "",
    schoolOrWork: "",
    ageRange: "prefer_not",
    socialBattery: "ambivert",
    hungerPreference: "any",
    transportMode: "driving",
  });

  function toggleInterest(value: string) {
    setPreferences((prev) => ({
      ...prev,
      interests: prev.interests.includes(value)
        ? prev.interests.filter((x) => x !== value)
        : [...prev.interests, value],
    }));
  }

  function toggleTime(value: typeof TIME_OPTIONS[number]) {
    setPreferences((prev) => ({
      ...prev,
      preferredTimes: prev.preferredTimes.includes(value)
        ? prev.preferredTimes.filter((x) => x !== value)
        : [...prev.preferredTimes, value],
    }));
  }

  function finish() {
    setPreferencesAndFinishOnboarding(preferences);
    router.replace("/");
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.progressRow}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, step === i && styles.dotActive]}
          />
        ))}
      </View>

      <Text style={styles.stepLabel}>
        {step === 0 ? "Welcome" : "Get better suggestions"}
      </Text>
      <Text style={styles.title}>{STEPS[step]}</Text>

      {step === 0 && (
        <>
          <Text style={styles.subtitle}>
            Real places near you—cafes, comedy, parks, that kind of thing. Skip anytime, or pick a few interests so we’re less random.
          </Text>
        </>
      )}

      {step === 1 && (
        <>
          <Text style={styles.subtitle}>
            What would you actually say yes to this week?
          </Text>
          {USER_INTEREST_SECTIONS.map((section) => (
            <View key={section.title} style={styles.interestSection}>
              <Text style={styles.interestSectionTitle}>{section.title}</Text>
              <View style={styles.chipGrid}>
                {section.items.map(({ key, label }) => {
                  const active = preferences.interests.includes(key);
                  return (
                    <Pressable
                      key={key}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => toggleInterest(key)}
                    >
                      <Text
                        style={[styles.chipText, active && styles.chipTextActive]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </>
      )}

      {step === 2 && (
        <>
          <Text style={styles.subtitle}>
            These make the app more realistic, not just more personalized.
          </Text>

          <SectionLabel label="Social mode" styles={styles} />
          <ChoiceRow
            options={["solo", "social", "both"]}
            value={preferences.socialMode}
            onSelect={(value) =>
              setPreferences((prev) => ({
                ...prev,
                socialMode: value as UserPreferences["socialMode"],
              }))
            }
            styles={styles}
          />

          <SectionLabel label="Budget" styles={styles} />
          <ChoiceRow
            options={["free", "cheap", "flexible"]}
            value={preferences.budget}
            onSelect={(value) =>
              setPreferences((prev) => ({
                ...prev,
                budget: value as UserPreferences["budget"],
              }))
            }
            styles={styles}
          />

          <SectionLabel label="Energy" styles={styles} />
          <ChoiceRow
            options={["low", "medium", "high", "mixed"]}
            value={preferences.energyMode}
            onSelect={(value) =>
              setPreferences((prev) => ({
                ...prev,
                energyMode: value as UserPreferences["energyMode"],
              }))
            }
            styles={styles}
          />

          <SectionLabel label="Place type" styles={styles} />
          <ChoiceRow
            options={["indoors", "outdoors", "both"]}
            value={preferences.placeMode}
            onSelect={(value) =>
              setPreferences((prev) => ({
                ...prev,
                placeMode: value as UserPreferences["placeMode"],
              }))
            }
            styles={styles}
          />
        </>
      )}

      {step === 3 && (
        <>
          <Text style={styles.subtitle}>
            Pick when you’re most likely to follow through.
          </Text>

          <View style={styles.chipGrid}>
            {TIME_OPTIONS.map((time) => {
              const active = preferences.preferredTimes.includes(time);
              return (
                <Pressable
                  key={time}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleTime(time)}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {time}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <View style={styles.bottom}>
        {step === 0 ? (
          <>
            <Pressable
              style={styles.primaryButton}
              onPress={() => setStep(1)}
            >
              <Text style={styles.primaryButtonText}>Get started</Text>
            </Pressable>
            <Pressable
              style={styles.skipButton}
              onPress={() => {
                setPreferencesAndFinishOnboarding(preferences);
                router.replace("/");
              }}
            >
              <Text style={styles.skipButtonText}>Skip—find something now</Text>
            </Pressable>
          </>
        ) : step < STEPS.length - 1 ? (
          <>
            <Pressable
              style={styles.primaryButton}
              onPress={() => setStep((s) => s + 1)}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => setStep((s) => s - 1)}
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={styles.primaryButton} onPress={finish}>
              <Text style={styles.primaryButtonText}>Finish</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => setStep((s) => s - 1)}
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function SectionLabel({
  label,
  styles,
}: {
  label: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function ChoiceRow({
  options,
  value,
  onSelect,
  styles,
}: {
  options: string[];
  value: string;
  onSelect: (value: string) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            style={[styles.choice, active && styles.choiceActive]}
            onPress={() => onSelect(option)}
          >
            <Text
              style={[styles.choiceText, active && styles.choiceTextActive]}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingTop: 64,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  progressRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: spacing.lg,
  },
  dot: {
    height: 4,
    flex: 1,
    backgroundColor: colors.bgMuted,
    borderRadius: 999,
  },
  dotActive: {
    backgroundColor: colors.bgDark,
  },
  stepLabel: {
    fontSize: font.sizeSm,
    color: colors.textSub,
    fontWeight: "600",
    marginBottom: 8,
    letterSpacing: 0,
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
  interestSection: {
    marginBottom: spacing.lg,
  },
  interestSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textMuted,
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
  sectionLabel: {
    fontSize: font.sizeSm,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 10,
    marginTop: 8,
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  choice: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  choiceActive: {
    backgroundColor: colors.bgDark,
    borderColor: colors.bgDark,
  },
  choiceText: {
    color: colors.text,
    fontSize: font.sizeSm,
    fontWeight: "700",
  },
  choiceTextActive: {
    color: colors.textInverse,
  },
  bottom: {
    marginTop: spacing.xl,
    gap: 10,
  },
  primaryButton: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: "center",
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
  skipButton: {
    paddingVertical: 14,
    alignItems: "center",
  },
  skipButtonText: {
    color: colors.textMuted,
    fontSize: font.sizeSm,
    fontWeight: "600",
  },
});
}