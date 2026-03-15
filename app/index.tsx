import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useThemeColors } from "../hooks/use-theme-colors";
import { font, radius, spacing } from "../lib/theme";
import { useMoveStore } from "../store/move-context";

function OptionCard({
  icon,
  title,
  subtitle,
  onPress,
  variant = "default",
  iconTint,
  colors,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  variant?: "hero" | "default";
  iconTint?: "accent" | "warm" | "muted";
  colors: ReturnType<typeof useThemeColors>;
  styles: ReturnType<typeof createStyles>;
}) {
  const isHero = variant === "hero";
  const iconBg =
    iconTint === "warm"
      ? "rgba(167, 139, 250, 0.35)"
      : iconTint === "muted"
        ? colors.bgMuted
        : colors.accentSoft;
  const iconColor =
    iconTint === "warm"
      ? colors.accentWarm
      : iconTint === "muted"
        ? colors.textMuted
        : colors.accent;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        isHero && styles.heroCard,
        pressed && styles.cardPressed,
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View
        style={[
          styles.iconWrap,
          isHero && styles.heroIconWrap,
          !isHero && { backgroundColor: iconBg },
        ]}
      >
        <Ionicons
          name={icon}
          size={isHero ? 32 : 24}
          color={isHero ? colors.textOnDark : iconColor}
        />
      </View>
      <View style={styles.optionText}>
        <Text
          style={[styles.optionTitle, isHero && styles.heroTitle]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={[styles.optionSub, isHero && styles.heroSub]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={isHero ? "rgba(255,255,255,0.7)" : colors.textMuted}
      />
    </Pressable>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  const cardShadow = Platform.select({
    ios: {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
    },
    android: { elevation: 4 },
    default: {},
  });
  const isDark = colors.bg === "#12100E";
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: {
      paddingTop: 56,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xxl,
    },
    loadingScreen: {
      flex: 1,
      backgroundColor: colors.bg,
      justifyContent: "center",
      alignItems: "center",
      gap: spacing.sm,
    },
    loadingText: { fontSize: font.sizeMd, color: colors.textMuted },
    header: { marginBottom: spacing.lg },
    eyebrow: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 2.5,
      color: colors.accent,
      marginBottom: 6,
      textTransform: "uppercase",
    },
    title: {
      fontSize: 40,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.5,
      lineHeight: 44,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: font.sizeMd,
      color: colors.textSub,
      lineHeight: 24,
    },
    headerAccent: {
      width: 48,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.accent,
      marginTop: spacing.md,
      opacity: 0.9,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1,
      color: colors.textSub,
      marginBottom: spacing.sm,
      marginTop: spacing.lg,
    },
    heroSection: { marginBottom: spacing.xs },
    cardStack: { gap: spacing.sm, marginBottom: spacing.xs },
    card: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bgCard,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    heroCard: {
      backgroundColor: isDark ? colors.bgCardSoft : "#252119",
      borderColor: isDark ? colors.bgCardSoft : "#252119",
      padding: spacing.lg,
      borderLeftWidth: 4,
      borderLeftColor: "rgba(99, 102, 241, 0.5)",
      ...Platform.select({
        ios: {
          shadowColor: colors.shadow,
          shadowOpacity: 0.15,
          shadowRadius: 16,
        },
        android: { elevation: 8 },
        default: {},
      }),
    },
    cardPressed: { opacity: 0.94 },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: spacing.md,
    },
    heroIconWrap: {
      backgroundColor: "rgba(255,255,255,0.15)",
    },
    optionText: { flex: 1, minWidth: 0 },
    optionTitle: {
      fontSize: font.sizeLg,
      fontWeight: "700",
      color: colors.text,
    },
    heroTitle: {
      fontSize: 22,
      color: colors.textOnDark,
    },
    optionSub: {
      fontSize: font.sizeSm,
      color: colors.textSub,
      marginTop: 2,
    },
    heroSub: {
      color: "rgba(255,255,255,0.75)",
      marginTop: 4,
    },
  });
}

export default function HomeScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { hasFinishedOnboarding, isLoaded } = useMoveStore();

  useEffect(() => {
    if (!isLoaded) return;
    if (!hasFinishedOnboarding) {
      router.replace("/onboarding");
    }
  }, [isLoaded, hasFinishedOnboarding]);

  if (!isLoaded) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!hasFinishedOnboarding) {
    return null;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Stop scrolling. Start doing.</Text>
        <Text style={styles.title}>What's the move?</Text>
        <Text style={styles.subtitle}>
          Tap below to find real places & events near you.
        </Text>
        <View style={styles.headerAccent} />
      </View>

      <View style={styles.heroSection}>
        <OptionCard
          icon="sparkles"
          title="Find places near me"
          subtitle="Cafes, concerts, walks & more—one tap"
          onPress={() => router.push("/whats-the-move-ai")}
          variant="hero"
          colors={colors}
          styles={styles}
        />
      </View>

      <Text style={styles.sectionLabel}>Or try this</Text>
      <View style={styles.cardStack}>
        <OptionCard
          icon="compass"
          title="Get a random idea"
          subtitle="Swipe through quick suggestions"
          onPress={() => router.push("/suggestions")}
          iconTint="accent"
          colors={colors}
          styles={styles}
        />
      </View>

      <Text style={styles.sectionLabel}>More</Text>
      <View style={styles.cardStack}>
        <OptionCard
          icon="time"
          title="Screen time"
          subtitle="Time you've reclaimed"
          onPress={() => router.push("/stopwatch")}
          iconTint="warm"
          colors={colors}
          styles={styles}
        />
        <OptionCard
          icon="bar-chart"
          title="Weekly report"
          subtitle="Progress and stats"
          onPress={() => router.push("/weekly-report")}
          iconTint="warm"
          colors={colors}
          styles={styles}
        />
      </View>

      <Text style={styles.sectionLabel}>More</Text>
      <View style={styles.cardStack}>
        <OptionCard
          icon="heart"
          title="Edit interests"
          subtitle="Customize suggestions"
          onPress={() => router.push("/edit-interests")}
          iconTint="muted"
          colors={colors}
          styles={styles}
        />
      </View>
    </ScrollView>
  );
}
