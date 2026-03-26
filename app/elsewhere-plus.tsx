import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../hooks/use-theme-colors";
import {
  dismissPaywall,
  grantPlusSubscription,
  startFreeTrial,
} from "../lib/plus-entitlements";
import { font, radius, spacing } from "../lib/theme";
import { usePlusEntitlements } from "../store/plus-context";

const HERO_URI =
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&q=80";

export default function ElsewherePlusScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { refresh } = usePlusEntitlements();
  const params = useLocalSearchParams<{ source?: string }>();
  const source = typeof params.source === "string" ? params.source : "";

  const styles = useMemo(
    () => createStyles(colors, insets.top, insets.bottom),
    [colors, insets.top, insets.bottom]
  );

  async function onMaybeLater() {
    Haptics.selectionAsync();
    await dismissPaywall();
    await refresh();
    router.back();
  }

  async function onStartTrial() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await startFreeTrial();
    await refresh();
    router.back();
  }

  async function onSubscribeSimulated() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await grantPlusSubscription();
    await refresh();
    router.back();
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroWrap}>
          <Image source={{ uri: HERO_URI }} style={styles.heroImg} contentFit="cover" />
          <LinearGradient
            colors={["rgba(0,0,0,0.1)", "rgba(10,8,6,0.92)", colors.bg]}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            style={[styles.closeBtn, { top: Math.max(insets.top, 12) + 4 }]}
            onPress={() => void onMaybeLater()}
            hitSlop={12}
          >
            <Ionicons name="close" size={28} color="rgba(255,255,255,0.9)" />
          </Pressable>
        </View>

        <View style={styles.body}>
          {source ? (
            <Text style={styles.sourceHint}>
              {source === "trial_ended"
                ? "Your Plus trial ended — you’re still on a solid free deck."
                : "Unlock the full experience."}
            </Text>
          ) : null}

          <Text style={styles.headline}>The move you almost missed.</Text>
          <Text style={styles.subhead}>
            Elsewhere Plus surfaces the things happening tonight that most people never find out about.
          </Text>

          <View style={styles.featureList}>
            <View style={styles.featureRow}>
              <Text style={styles.featureIcon}>⚡</Text>
              <Text style={styles.featureText}>
                Wildcard picks — rare, time-sensitive, hyper-local. The good stuff.
              </Text>
            </View>
            <View style={styles.featureRow}>
              <Text style={styles.featureIcon}>📅</Text>
              <Text style={styles.featureText}>
                Plan ahead — tonight, this weekend, pick a date, months out.
              </Text>
            </View>
            <View style={styles.featureRow}>
              <Text style={styles.featureIcon}>🧠</Text>
              <Text style={styles.featureText}>
                Gets smarter — learns what you actually like the more you use it.
              </Text>
            </View>
          </View>

          <View style={styles.pricingBlock}>
            <Pressable
              style={[styles.planCard, styles.planCardHighlight, { borderColor: colors.accent }]}
              onPress={() => void onSubscribeSimulated()}
            >
              <View style={styles.planBadge}>
                <Text style={[styles.planBadgeText, { color: colors.textInverse }]}>Best value</Text>
              </View>
              <Text style={styles.planTitle}>$49.99 / year</Text>
              <Text style={[styles.planSave, { color: colors.accent }]}>Save 48%</Text>
              <Text style={styles.planFootnote}>
                Less than one Uber to something you&apos;d have missed anyway.
              </Text>
            </Pressable>

            <Pressable
              style={[styles.planCard, { borderColor: colors.border }]}
              onPress={() => void onSubscribeSimulated()}
            >
              <Text style={styles.planTitleMuted}>$7.99 / month</Text>
              <Text style={styles.planSubMuted}>Flexible — cancel anytime</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.cta, { backgroundColor: colors.accent }]}
            onPress={() => void onStartTrial()}
          >
            <Text style={[styles.ctaText, { color: colors.textInverse }]}>Start 7-day free trial</Text>
          </Pressable>
          <Text style={styles.finePrint}>Cancel anytime. No charge for 7 days.</Text>

          <Text style={styles.legal}>
            Subscriptions are simulated in this build — connect App Store / Play Billing before launch.
          </Text>

          <Pressable style={styles.maybeLaterWrap} onPress={() => void onMaybeLater()}>
            <Text style={styles.maybeLater}>Maybe later</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(
  colors: ReturnType<typeof useThemeColors>,
  insetTop: number,
  insetBottom: number
) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: insetBottom + spacing.xl },
    heroWrap: {
      height: 280,
      width: "100%",
      position: "relative",
      backgroundColor: "#0a0806",
    },
    heroImg: { ...StyleSheet.absoluteFillObject },
    closeBtn: {
      position: "absolute",
      right: spacing.md,
      zIndex: 4,
      padding: 4,
    },
    body: {
      paddingHorizontal: spacing.md,
      marginTop: -spacing.lg,
    },
    sourceHint: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textMuted,
      marginBottom: spacing.sm,
    },
    headline: {
      fontSize: 28,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.5,
      lineHeight: 34,
      marginBottom: spacing.sm,
    },
    subhead: {
      fontSize: font.sizeMd,
      lineHeight: 24,
      color: colors.textSub,
      marginBottom: spacing.lg,
    },
    featureList: { gap: spacing.md, marginBottom: spacing.lg },
    featureRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
    featureIcon: { fontSize: 20, lineHeight: 24 },
    featureText: {
      flex: 1,
      fontSize: font.sizeSm,
      lineHeight: 22,
      color: colors.text,
      fontWeight: "600",
    },
    pricingBlock: { gap: spacing.sm, marginBottom: spacing.lg },
    planCard: {
      borderRadius: radius.md,
      borderWidth: 2,
      padding: spacing.md,
      backgroundColor: colors.bgCard,
    },
    planCardHighlight: {
      paddingTop: spacing.lg,
    },
    planBadge: {
      position: "absolute",
      top: 10,
      right: 12,
      backgroundColor: colors.accent,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.sm,
    },
    planBadgeText: { fontSize: 11, fontWeight: "800" },
    planTitle: { fontSize: 22, fontWeight: "800", color: colors.text },
    planTitleMuted: { fontSize: 18, fontWeight: "800", color: colors.textMuted },
    planSave: { fontSize: 14, fontWeight: "800", marginTop: 4 },
    planSubMuted: { fontSize: 13, color: colors.textMuted, marginTop: 6 },
    planFootnote: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: spacing.sm,
      lineHeight: 18,
      fontStyle: "italic",
    },
    cta: {
      paddingVertical: 16,
      borderRadius: radius.md,
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    ctaText: { fontSize: 17, fontWeight: "800" },
    finePrint: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: "center",
      marginBottom: spacing.md,
    },
    legal: {
      fontSize: 11,
      color: colors.textMuted,
      lineHeight: 16,
      marginBottom: spacing.md,
      opacity: 0.85,
    },
    maybeLaterWrap: { alignItems: "center", paddingVertical: spacing.md },
    maybeLater: {
      fontSize: 14,
      color: colors.textMuted,
      fontWeight: "600",
    },
  });
}
