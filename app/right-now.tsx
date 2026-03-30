import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../hooks/use-theme-colors";
import type { ConciergeSuggestion } from "../lib/concierge-types";
import { font, radius, spacing } from "../lib/theme";
import { getReadableLocation } from "../lib/location";
import { getRecentConciergeTitles } from "../lib/recent-concierge-storage";
import { buildUserContextLine } from "../lib/user-context-line";
import { useMoveStore } from "../store/move-context";
import { ConciergeHeroCard } from "../components/concierge-hero-card";
import { GoingSheet } from "../components/going-sheet";
import {
  dedupeWithinList,
  getExcludeSuggestionKeys,
} from "../lib/shown-concierge-ids";
import { getSwipeSignalsForApi, recordSwipeCommit } from "../lib/swipe-signals-storage";
import { getSavedConciergeMoves } from "../lib/saved-concierge-storage";
import { recordDecayCommitted } from "../lib/suggestion-decay-storage";
import { saveCommittedMove } from "../lib/committed-move-storage";
import { persistSwipeForHistory } from "../lib/shown-concierge-ids";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const SERVER_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.154:3001";

/** Parse "Tonight at 7:00 PM" → ms timestamp for today */
function parseStartTimeMs(text: string, nowMs: number): number | null {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(text);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  const d = new Date(nowMs);
  d.setHours(hours, minutes, 0, 0);
  if (d.getTime() < nowMs - 60_000) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Miles extracted from distanceText like "2.4 mi away" */
function extractMiles(distanceText?: string): number | null {
  if (!distanceText) return null;
  const m = /(\d+(\.\d+)?)\s*mi/i.exec(distanceText);
  return m ? parseFloat(m[1]) : null;
}

function qualifiesRightNow(s: ConciergeSuggestion, nowMs: number): boolean {
  // Cost filter — skip $$ and above
  if (s.cost && /\$\$/.test(s.cost)) return false;

  // Drive time ≤ 20 min (miles * 3 minutes/mile)
  const miles = extractMiles(s.distanceText);
  if (miles !== null && miles * 3 > 20) return false;

  // Time window: open now OR starting within 90 min
  const ninetyMin = 90 * 60 * 1000;

  if (s.placeOpenNow === true) return true;

  // Check ISO start time
  const iso = s.showtimes?.[0]?.startIso;
  if (iso) {
    const startMs = new Date(iso).getTime();
    const diff = startMs - nowMs;
    if (diff >= 0 && diff <= ninetyMin) return true;
  }

  // Check text start time
  if (s.startTime) {
    const startMs = parseStartTimeMs(s.startTime, nowMs);
    if (startMs !== null) {
      const diff = startMs - nowMs;
      if (diff >= 0 && diff <= ninetyMin) return true;
    }
  }

  return false;
}

function urgencyLabel(s: ConciergeSuggestion, nowMs: number): string {
  if (s.placeOpenNow === true) {
    return "Open right now";
  }

  const iso = s.showtimes?.[0]?.startIso;
  const startMs = iso
    ? new Date(iso).getTime()
    : s.startTime
    ? parseStartTimeMs(s.startTime, nowMs)
    : null;

  if (startMs === null) return "Available now";

  const diffMs = startMs - nowMs;
  const diffMin = Math.round(diffMs / 60_000);

  if (diffMin <= 2) return "Starting now";
  if (diffMin < 60) return `Starts in ${diffMin} min`;
  const hrs = Math.round(diffMin / 60);
  return `Starts in ~${hrs} hr`;
}

function mapApiSuggestion(x: Record<string, unknown>): ConciergeSuggestion {
  const showtimesRaw = x.showtimes;
  const showtimes = Array.isArray(showtimesRaw)
    ? showtimesRaw
        .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : null))
        .filter(Boolean)
        .map((p) => ({
          label: String(p!.label ?? ""),
          startIso: p!.startIso != null ? String(p!.startIso) : undefined,
          bookingUrl: p!.bookingUrl != null ? String(p!.bookingUrl) : undefined,
        }))
        .filter((p) => p.label)
    : undefined;
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
    kind: x.kind != null ? String(x.kind) : undefined,
    movieTitle: x.movieTitle != null ? String(x.movieTitle) : undefined,
    theaterSubtitle: x.theaterSubtitle != null ? String(x.theaterSubtitle) : undefined,
    tmdbId: x.tmdbId != null ? String(x.tmdbId) : undefined,
    tmdbRating: typeof x.tmdbRating === "number" ? x.tmdbRating : null,
    runtimeMinutes: typeof x.runtimeMinutes === "number" ? x.runtimeMinutes : null,
    showtimes,
    fandangoFallbackUrl: x.fandangoFallbackUrl != null ? String(x.fandangoFallbackUrl) : undefined,
    flavorTag: x.flavorTag != null ? String(x.flavorTag) : undefined,
    placeOpenNow: x.placeOpenNow === true ? true : x.placeOpenNow === false ? false : null,
    closesSoon: Boolean(x.closesSoon),
    openUntil: x.openUntil != null ? String(x.openUntil) : undefined,
    deckRole: x.deckRole != null ? String(x.deckRole) : undefined,
    sourceType: x.sourceType != null ? String(x.sourceType) : undefined,
    cost: x.cost != null ? String(x.cost) : undefined,
    isTimeSensitive: x.isTimeSensitive === true,
    distanceText: x.distanceText != null ? String(x.distanceText) : undefined,
    dateBadge: x.dateBadge != null ? String(x.dateBadge) : undefined,
    ageRestriction:
      x.ageRestriction === "21+" || x.ageRestriction === "18+" || x.ageRestriction === "all ages"
        ? (x.ageRestriction as "21+" | "18+" | "all ages")
        : null,
  };
}

export default function RightNowScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { preferences } = useMoveStore();
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  const [candidates, setCandidates] = useState<ConciergeSuggestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [goingSheetSuggestion, setGoingSheetSuggestion] = useState<ConciergeSuggestion | null>(null);

  const styles = useMemo(() => createStyles(insets.top, insets.bottom), [insets.top, insets.bottom]);
  const CARD_W = SCREEN_W - spacing.md * 2;
  const CARD_H = Math.min(SCREEN_H * 0.55, 420);

  const nowMs = useRef(Date.now());

  useEffect(() => {
    void (async () => {
      try {
        const prefs = preferencesRef.current;
        const loc = await getReadableLocation();
        const nowIso = new Date().toISOString();
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const excludeKeys = await getExcludeSuggestionKeys();
        const recentSuggestions = await getRecentConciergeTitles();
        const swipeSignals = await getSwipeSignalsForApi();
        const savedMoves = await getSavedConciergeMoves();
        const savedMoveTitles = savedMoves.slice(0, 20).map((m) => m.suggestion.title);

        const res = await fetch(`${SERVER_URL}/concierge-recommendations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-app-secret": process.env.EXPO_PUBLIC_APP_SECRET || "",
          },
          body: JSON.stringify({
            lat: loc.lat,
            lng: loc.lon,
            areaLabel: loc.place || "near you",
            nowIso,
            timeZone,
            energy: "medium",
            timeBudget: "30min",
            interests: prefs.interests ?? [],
            recentSuggestions,
            excludeSuggestionKeys: excludeKeys,
            conciergeTier: "plus",
            userContextLine: buildUserContextLine(prefs),
            hungerPreference: prefs.hungerPreference ?? "any",
            ageRange: prefs.ageRange ?? "prefer_not",
            transportMode: prefs.transportMode ?? "driving",
            ...(swipeSignals ? { swipeSignals } : {}),
            ...(savedMoveTitles.length > 0 ? { savedMoveTitles } : {}),
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error("Fetch failed");

        const rawList = Array.isArray(data.suggestions) ? data.suggestions : [];
        const mapped = dedupeWithinList(
          rawList.map((item: unknown) =>
            mapApiSuggestion(item && typeof item === "object" ? (item as Record<string, unknown>) : {})
          )
        );

        const now = Date.now();
        nowMs.current = now;
        const filtered = mapped.filter((s) => qualifiesRightNow(s, now));
        setCandidates(filtered);
      } catch {
        setCandidates([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const current = candidates[idx] ?? null;
  const hasMore = idx < candidates.length - 1;

  function handleShowAnother() {
    Haptics.selectionAsync();
    if (hasMore) {
      setIdx((i) => i + 1);
    }
  }

  const handleGoingConfirm = useCallback((s: ConciergeSuggestion) => {
    void recordDecayCommitted(s);
    void recordSwipeCommit(s.category || "experience");
    void saveCommittedMove(s.title, s.category || "experience");
    persistSwipeForHistory(s);
    const u = String(s.ticketUrl || "").trim();
    if (u) Linking.openURL(u).catch(() => {});
    else {
      const query = String(s.mapQuery || s.title || "").trim();
      if (query) {
        const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
        Linking.openURL(url).catch(() => {});
      }
    }
    setGoingSheetSuggestion(null);
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Right Now</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Finding what's available…</Text>
        </View>
      ) : candidates.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Nothing right now</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Nothing's starting in the next 90 min that matches your vibe.
          </Text>
          <Pressable style={[styles.backPill, { borderColor: colors.border }]} onPress={() => router.back()}>
            <Text style={[styles.backPillText, { color: colors.textMuted }]}>Back to For You</Text>
          </Pressable>
        </View>
      ) : current ? (
        <View style={styles.content}>
          {/* Urgency pill */}
          <View style={styles.urgencyPill}>
            <Text style={styles.urgencyText}>{urgencyLabel(current, nowMs.current)}</Text>
          </View>

          {/* Card */}
          <View style={styles.cardWrap}>
            <ConciergeHeroCard
              suggestion={current}
              width={CARD_W}
              deckMaxHeight={CARD_H}
              imageGradientBottomColor={colors.bgCard}
              colors={colors}
              swipeMode={false}
              bookmarkSaved={false}
            />
          </View>

          {/* Buttons */}
          <View style={styles.btnRow}>
            <Pressable
              style={[styles.goBtn, { backgroundColor: colors.accent }]}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setGoingSheetSuggestion(current);
              }}
            >
              <Text style={[styles.goBtnText, { color: "#1C1916" }]}>I'm going</Text>
            </Pressable>
            {hasMore ? (
              <Pressable style={styles.anotherBtn} onPress={handleShowAnother}>
                <Text style={[styles.anotherBtnText, { color: colors.text }]}>Show me another</Text>
              </Pressable>
            ) : (
              <View style={styles.anotherBtn}>
                <Text style={[styles.anotherBtnText, { color: colors.textMuted }]}>That's the best one for right now.</Text>
              </View>
            )}
          </View>
        </View>
      ) : null}

      <GoingSheet
        suggestion={goingSheetSuggestion}
        onConfirm={handleGoingConfirm}
        onCancel={() => setGoingSheetSuggestion(null)}
      />
    </View>
  );
}

function createStyles(insetTop: number, insetBottom: number) {
  const topPad = Math.max(insetTop, 16);
  const bottomPad = Math.max(insetBottom, 16);
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    header: {
      paddingTop: topPad,
      paddingHorizontal: spacing.md,
      paddingBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    backBtn: {
      padding: 4,
    },
    headerTitle: {
      fontSize: font.sizeLg,
      fontWeight: "700",
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      gap: 12,
    },
    loadingText: {
      fontSize: font.sizeMd,
      marginTop: 8,
    },
    emptyTitle: {
      fontSize: font.sizeLg,
      fontWeight: "700",
      textAlign: "center",
    },
    emptySub: {
      fontSize: font.sizeMd,
      textAlign: "center",
      lineHeight: 22,
    },
    backPill: {
      marginTop: 8,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderRadius: radius.full,
      borderWidth: 1,
    },
    backPillText: {
      fontSize: font.sizeSm,
      fontWeight: "500",
    },
    content: {
      flex: 1,
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingBottom: bottomPad,
    },
    urgencyPill: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: radius.full,
      backgroundColor: "#D4A857",
      marginBottom: 14,
      alignSelf: "center",
    },
    urgencyText: {
      fontSize: font.sizeSm,
      fontWeight: "700",
      color: "#1C1916",
      letterSpacing: 0.3,
    },
    cardWrap: {
      width: "100%",
      alignItems: "center",
      marginBottom: 20,
    },
    btnRow: {
      width: "100%",
      gap: 10,
    },
    goBtn: {
      height: 56,
      borderRadius: radius.lg,
      alignItems: "center",
      justifyContent: "center",
    },
    goBtnText: {
      fontSize: font.sizeMd,
      fontWeight: "700",
    },
    anotherBtn: {
      height: 50,
      borderRadius: radius.lg,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.06)",
    },
    anotherBtnText: {
      fontSize: font.sizeSm,
      fontWeight: "600",
    },
  });
}
