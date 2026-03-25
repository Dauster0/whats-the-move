import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../hooks/use-theme-colors";
import type { ConciergeEnergy, ConciergeSuggestion, ConciergeTimeBudget } from "../lib/concierge-types";
import { font, radius, spacing } from "../lib/theme";
import { getReadableLocation } from "../lib/location";
import { getRecentConciergeTitles, pushRecentConciergeTitle } from "../lib/recent-concierge-storage";
import { buildUserContextLine } from "../lib/user-context-line";
import { useMoveStore } from "../store/move-context";
import { ConciergeHeroCard, getConciergeCardMinHeight } from "../components/concierge-hero-card";
import { setConciergeDetailPayload } from "../lib/concierge-detail-storage";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = SCREEN_W;
const SERVER_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.154:3001";

type LoadMode = "full" | "refresh" | "background";

function openMapsQuery(q: string) {
  const query = String(q || "").trim();
  if (!query) return;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  Linking.openURL(url).catch(() => {});
}

function mapApiConciergeSuggestion(x: Record<string, unknown>): ConciergeSuggestion {
  return {
    title: String(x.title ?? ""),
    description: String(x.description ?? ""),
    category: String(x.category ?? "experience"),
    timeRequired: String(x.timeRequired ?? ""),
    energyLevel: String(x.energyLevel ?? "medium"),
    address: String(x.address ?? ""),
    startTime: String(x.startTime ?? ""),
    venueName: String(x.venueName ?? ""),
    mapQuery: String(x.mapQuery ?? x.title ?? ""),
    unsplashQuery: String(x.unsplashQuery ?? ""),
    whyNow: String(x.whyNow ?? ""),
    ticketUrl: String(x.ticketUrl ?? ""),
    ticketEventId: String(x.ticketEventId ?? ""),
    sourcePlaceName: String(x.sourcePlaceName ?? ""),
    googlePlaceResourceName: String(x.googlePlaceResourceName ?? ""),
    photoUrl: x.photoUrl ? String(x.photoUrl) : null,
    imageLayout: x.imageLayout === "poster" ? "poster" : "cover",
    photoSource: x.photoSource != null ? String(x.photoSource) : null,
  };
}

export default function HomeScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { hasFinishedOnboarding, isLoaded, preferences } = useMoveStore();

  const [energy, setEnergy] = useState<ConciergeEnergy>("medium");
  const [timeBudget, setTimeBudget] = useState<ConciergeTimeBudget>("mid");
  const [suggestions, setSuggestions] = useState<ConciergeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [areaLabel, setAreaLabel] = useState("");
  const [cardIndex, setCardIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const hasHadFocusOnce = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!hasFinishedOnboarding) {
      router.replace("/onboarding");
    }
  }, [isLoaded, hasFinishedOnboarding]);

  const load = useCallback(async (mode: LoadMode = "full") => {
    if (mode === "refresh") setRefreshing(true);
    else if (mode === "full") setLoading(true);
    if (mode !== "background") setError("");
    try {
      const loc = await getReadableLocation();
      const place = loc.place || "near you";
      setAreaLabel(place);
      const recentSuggestions = await getRecentConciergeTitles();
      const nowIso = new Date().toISOString();
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const prefs = preferencesRef.current;

      const res = await fetch(`${SERVER_URL}/concierge-recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: loc.lat,
          lng: loc.lon,
          areaLabel: place,
          nowIso,
          timeZone,
          energy,
          timeBudget,
          interests: prefs.interests ?? [],
          recentSuggestions,
          userContextLine: buildUserContextLine(prefs),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (mode === "background") return;
        setSuggestions([]);
        setError(typeof data.error === "string" ? data.error : "Couldn’t load picks.");
        return;
      }
      const rawList = Array.isArray(data.suggestions) ? data.suggestions : [];
      const list = rawList.map((item: unknown) =>
        mapApiConciergeSuggestion(item && typeof item === "object" ? (item as Record<string, unknown>) : {})
      );
      setSuggestions(list);
      setCardIndex(0);
      scrollRef.current?.scrollTo({ x: 0, animated: false });
      if (list.length === 0) {
        if (mode !== "background") setError("Nothing came back—try refresh.");
      }
    } catch {
      if (mode !== "background") {
        setSuggestions([]);
        setError("Network hiccup. Pull to try again.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [energy, timeBudget]);

  useEffect(() => {
    if (!isLoaded || !hasFinishedOnboarding) return;
    load("full");
  }, [isLoaded, hasFinishedOnboarding, energy, timeBudget, load]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoaded || !hasFinishedOnboarding) return;
      if (!hasHadFocusOnce.current) {
        hasHadFocusOnce.current = true;
        return;
      }
      void load("background");
    }, [isLoaded, hasFinishedOnboarding, load])
  );

  const openConciergeDetail = useCallback(
    async (s: ConciergeSuggestion) => {
      await setConciergeDetailPayload({
        suggestion: s,
        others: suggestions.filter((x) => x.title !== s.title),
      });
      void Haptics.selectionAsync();
      router.push("/concierge-detail");
    },
    [suggestions]
  );

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / CARD_W);
    setCardIndex(Math.max(0, Math.min(i, suggestions.length - 1)));
  }

  function openMenu() {
    Alert.alert("Elsewhere", undefined, [
      { text: "Interests", onPress: () => router.push("/edit-interests") },
      { text: "Your details", onPress: () => router.push("/my-context" as Href) },
      { text: "Saved moves", onPress: () => router.push("/saved-moves") },
      { text: "Shuffle deck", onPress: () => router.push("/suggestions") },
      { text: "Full finder", onPress: () => router.push("/whats-the-move-ai") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  if (!isLoaded) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>One sec.</Text>
      </View>
    );
  }

  if (!hasFinishedOnboarding) {
    return null;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.outerScroll}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load("refresh")}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.topBar}>
        <Text style={styles.areaPill} numberOfLines={1}>
          {areaLabel || "Near you"}
        </Text>
        <Pressable style={styles.menuBtn} onPress={openMenu} hitSlop={10}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </Pressable>
      </View>

      <Text style={styles.screenTitle}>{"What's the move?"}</Text>

      <View style={styles.controlBlock}>
        <Text style={styles.controlLabel}>Energy</Text>
        <View style={styles.segmentRow}>
            {(
            [
              { key: "low" as const, icon: "moon-outline" as const, label: "Low" },
              { key: "medium" as const, icon: "flash-outline" as const, label: "Mid" },
              { key: "high" as const, icon: "rocket-outline" as const, label: "High" },
            ] as const
          ).map(({ key, icon, label }) => {
            const active = energy === key;
            return (
              <Pressable
                key={key}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setEnergy(key);
                }}
              >
                <Ionicons
                  name={icon}
                  size={20}
                  color={active ? colors.textInverse : colors.text}
                />
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.controlLabel, { marginTop: spacing.md }]}>Time</Text>
        <View style={styles.segmentRow}>
          {(
            [
              { key: "30min" as const, label: "~30 min" },
              { key: "mid" as const, label: "1–3 hrs" },
              { key: "allday" as const, label: "No rush" },
            ] as const
          ).map(({ key, label }) => {
            const active = timeBudget === key;
            return (
              <Pressable
                key={key}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setTimeBudget(key);
                }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading && suggestions.length === 0 ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingBlurb}>Reading the room…</Text>
          <Text style={styles.loadingSub}>Pulling what’s open, what’s on, and what fits you.</Text>
        </View>
      ) : error && suggestions.length === 0 ? (
        <View style={styles.loadingBlock}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              load("full");
            }}
          >
            <Text style={styles.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {suggestions.length > 1 ? (
            <Text style={styles.swipeHint}>
              Swipe sideways · {cardIndex + 1} of {suggestions.length}
            </Text>
          ) : null}
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            scrollEventThrottle={16}
            decelerationRate="fast"
            nestedScrollEnabled
            style={{ minHeight: getConciergeCardMinHeight(CARD_W) }}
            contentContainerStyle={styles.cardsScrollContent}
          >
            {suggestions.map((s, idx) => (
              <View key={`${s.title}-${idx}`} style={[styles.cardShell, { width: CARD_W }]}>
                <ConciergeHeroCard
                  suggestion={s}
                  width={CARD_W}
                  colors={colors}
                  onCardPress={() => void openConciergeDetail(s)}
                  onOpenMaps={(sg) => {
                    void pushRecentConciergeTitle(sg.title);
                    openMapsQuery(sg.mapQuery || sg.title);
                  }}
                  onOpenTickets={(sg) => {
                    void pushRecentConciergeTitle(sg.title);
                    const u = String(sg.ticketUrl || "").trim();
                    if (u) Linking.openURL(u).catch(() => {});
                  }}
                />
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>, insetTop: number) {
  const topPad = Math.max(insetTop, 12);
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    outerScroll: {
      flexGrow: 1,
      paddingBottom: spacing.xxl,
    },
    loadingScreen: {
      flex: 1,
      backgroundColor: colors.bg,
      justifyContent: "center",
      alignItems: "center",
      gap: spacing.sm,
    },
    loadingText: { fontSize: font.sizeMd, color: colors.textMuted, fontWeight: "500" },
    topBar: {
      paddingTop: topPad,
      paddingHorizontal: spacing.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    areaPill: {
      flex: 1,
      marginRight: spacing.sm,
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSub,
    },
    menuBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bgCard,
    },
    screenTitle: {
      fontSize: 28,
      fontWeight: "700",
      letterSpacing: -0.4,
      color: colors.text,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    controlBlock: {
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    controlLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textMuted,
      marginBottom: 8,
    },
    segmentRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    segment: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgCard,
    },
    segmentActive: {
      backgroundColor: colors.bgDark,
      borderColor: colors.bgDark,
    },
    segmentText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
    },
    segmentTextActive: {
      color: colors.textInverse,
    },
    swipeHint: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textMuted,
      paddingHorizontal: spacing.md,
      marginBottom: 8,
    },
    cardsScrollContent: {
      alignItems: "stretch",
    },
    cardShell: {
      paddingHorizontal: 0,
    },
    loadingBlock: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: spacing.xl,
      gap: spacing.sm,
      minHeight: 280,
    },
    loadingBlurb: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text,
      marginTop: spacing.sm,
    },
    loadingSub: {
      fontSize: 14,
      color: colors.textSub,
      textAlign: "center",
      lineHeight: 20,
    },
    errorText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textSub,
      textAlign: "center",
    },
    retryBtn: {
      marginTop: spacing.md,
      paddingVertical: 12,
      paddingHorizontal: 22,
      backgroundColor: colors.bgDark,
      borderRadius: radius.sm,
    },
    retryBtnText: {
      color: colors.textInverse,
      fontWeight: "700",
      fontSize: 15,
    },
  });
}
