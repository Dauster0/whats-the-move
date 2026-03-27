import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ConciergeEnergy, ConciergeSuggestion, ConciergeTimeBudget } from "../lib/concierge-types";
import {
  setConciergeDetailPayload,
  setPendingConciergeDetail,
} from "../lib/concierge-detail-storage";
import {
  getExcludeSuggestionKeys,
  persistSwipeForHistory,
  registerDeckKeys,
} from "../lib/shown-concierge-ids";
import {
  filterSuggestionsByDecay,
  getDecayContextForGpt,
  getDecayExcludedKeys,
  recordDecayCommitted,
  recordDecayDeckDisplayed,
  recordDecayRejected,
} from "../lib/suggestion-decay-storage";
import { getSwipeSignalsForApi, recordSwipeCommit, recordSwipeSkip } from "../lib/swipe-signals-storage";
import { addPlanningConciergeMove } from "../lib/planning-moves-storage";
import { buildUserContextLine } from "../lib/user-context-line";
import { getReadableLocation } from "../lib/location";
import { pushRecentConciergeTitle } from "../lib/recent-concierge-storage";
import { setPeekDetailHandlers } from "../lib/peek-detail-handlers";
import type { UserPreferences } from "../store/move-context";
import { colorsDark, radius, spacing } from "../lib/theme";
import { ConciergeHeroCard } from "./concierge-hero-card";
import { ConciergeSwipeDeck, DeckButtons } from "./concierge-swipe-deck";

const SERVER_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.154:3001";

export type AheadWindowKey = "tonight" | "weekend" | "date" | "further";

type ThemeColors = typeof colorsDark;

function openMapsQuery(q: string) {
  const query = String(q || "").trim();
  if (!query) return;
  Linking.openURL(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
  ).catch(() => {});
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
    movieGenres: Array.isArray(x.movieGenres) ? x.movieGenres.map((g) => String(g)) : undefined,
    movieBackdropUrl: x.movieBackdropUrl != null ? String(x.movieBackdropUrl) : undefined,
    showtimes,
    fandangoFallbackUrl:
      x.fandangoFallbackUrl != null ? String(x.fandangoFallbackUrl) : undefined,
    flavorTag: x.flavorTag != null ? String(x.flavorTag) : undefined,
    placeOpenNow:
      x.placeOpenNow === true ? true : x.placeOpenNow === false ? false : null,
    closesSoon: Boolean(x.closesSoon),
    openUntil: x.openUntil != null ? String(x.openUntil) : undefined,
    deckRole: x.deckRole != null ? String(x.deckRole) : undefined,
    sourceType: x.sourceType != null ? String(x.sourceType) : undefined,
    cost: x.cost != null ? String(x.cost) : undefined,
    isTimeSensitive: x.isTimeSensitive === true,
    distanceText: x.distanceText != null ? String(x.distanceText) : undefined,
    dateBadge: x.dateBadge != null ? String(x.dateBadge) : undefined,
    ageRestriction: (x.ageRestriction === "21+" || x.ageRestriction === "18+" || x.ageRestriction === "all ages")
      ? x.ageRestriction as "21+" | "18+" | "all ages"
      : null,
  };
}

function ymdToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ymdAddDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  const ms = Date.UTC(y, m - 1, d + n, 12, 0, 0);
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

type Props = {
  colors: ThemeColors;
  preferences: UserPreferences;
  energy: ConciergeEnergy;
  timeBudget: ConciergeTimeBudget;
  deckWidth: number;
  deckHeight: number;
};

export function ComingUpPanel({
  colors,
  preferences,
  energy,
  timeBudget,
  deckWidth,
  deckHeight,
}: Props) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom]);

  const [expanded, setExpanded] = useState<Record<AheadWindowKey, boolean>>({
    tonight: true,
    weekend: false,
    date: false,
    further: false,
  });
  const [pickedYmd, setPickedYmd] = useState(() => ymdAddDays(ymdToday(), 7));
  const [dateModal, setDateModal] = useState(false);

  const [decks, setDecks] = useState<Partial<Record<AheadWindowKey, ConciergeSuggestion[]>>>({});
  const [loading, setLoading] = useState<Partial<Record<AheadWindowKey, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<AheadWindowKey, string>>>({});

  const decksRef = useRef(decks);
  decksRef.current = decks;

  const fetchAhead = useCallback(
    async (w: AheadWindowKey, dateYmd?: string) => {
      setLoading((prev) => ({ ...prev, [w]: true }));
      setErrors((prev) => ({ ...prev, [w]: "" }));
      try {
        const loc = await getReadableLocation();
        const place = loc.place || "near you";
        const ints = preferences.interests ?? [];
        if (ints.length === 0) throw new Error("Pick interests first.");
        const nowIso = new Date().toISOString();
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const baseExclude = await getExcludeSuggestionKeys();
        const decayKeys = await getDecayExcludedKeys();
        const excludeSuggestionKeys = [...new Set([...baseExclude, ...decayKeys])];
        const decayRecentNames = await getDecayContextForGpt();
        const swipeSignals = await getSwipeSignalsForApi();

        const res = await fetch(`${SERVER_URL}/concierge-ahead`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-app-secret": process.env.EXPO_PUBLIC_APP_SECRET || "" },
          body: JSON.stringify({
            lat: loc.lat,
            lng: loc.lon,
            areaLabel: place,
            nowIso,
            timeZone,
            energy,
            timeBudget,
            interests: ints,
            userContextLine: buildUserContextLine(preferences),
            hungerPreference: preferences.hungerPreference ?? "any",
            ageRange: preferences.ageRange ?? "prefer_not",
            ...(swipeSignals ? { swipeSignals } : {}),
            excludeSuggestionKeys,
            decayRecentNames,
            conciergeTier: "plus",
            aheadWindow: w,
            ...(w === "date" && dateYmd ? { pickedDateYmd: dateYmd } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" && data.error.trim()
              ? data.error.trim()
              : "Couldn’t load ideas."
          );
        }
        const rawList = Array.isArray(data.suggestions) ? data.suggestions : [];
        const mapped = rawList.map((item: unknown) =>
          mapApiSuggestion(item && typeof item === "object" ? (item as Record<string, unknown>) : {})
        );
        const list = mapped.length
          ? filterSuggestionsByDecay(mapped, Date.now(), new Set(await getDecayExcludedKeys()))
          : mapped;
        setDecks((prev) => ({ ...prev, [w]: list }));
        void recordDecayDeckDisplayed(list);
        registerDeckKeys(list);
      } catch (e) {
        setErrors((prev) => ({
          ...prev,
          [w]: e instanceof Error ? e.message : "Something went wrong.",
        }));
        setDecks((prev) => ({ ...prev, [w]: [] }));
      } finally {
        setLoading((prev) => ({ ...prev, [w]: false }));
      }
    },
    [preferences, energy, timeBudget]
  );

  const ensureLoaded = useCallback(
    (w: AheadWindowKey) => {
      const d = decksRef.current[w];
      if (d && d.length > 0) return;
      if (loading[w]) return;
      void fetchAhead(w, w === "date" ? pickedYmd : undefined);
    },
    [fetchAhead, loading, pickedYmd]
  );

  const toggle = useCallback(
    (w: AheadWindowKey) => {
      Haptics.selectionAsync();
      setExpanded((prev) => {
        const next = !prev[w];
        const out = { ...prev, [w]: next };
        if (next) {
          setTimeout(() => ensureLoaded(w), 0);
        }
        return out;
      });
    },
    [ensureLoaded]
  );

  const popCard = useCallback((w: AheadWindowKey, s: ConciergeSuggestion) => {
    setDecks((prev) => {
      const list = prev[w] ?? [];
      if (list[0] !== s) return prev;
      const next = list.slice(1);
      return { ...prev, [w]: next };
    });
  }, []);

  const openPeek = useCallback(
    (w: AheadWindowKey, s: ConciergeSuggestion, stack: ConciergeSuggestion[]) => {
      setPeekDetailHandlers({
        onNah: () => {
          void recordDecayRejected(s);
          void recordSwipeSkip(s.category || "experience");
          void pushRecentConciergeTitle(s.title);
          persistSwipeForHistory(s);
          popCard(w, s);
          setPeekDetailHandlers(null);
          router.back();
        },
        onCommit: () => {
          void recordDecayCommitted(s);
          void recordSwipeCommit(s.category || "experience");
          persistSwipeForHistory(s);
          void addPlanningConciergeMove(s);
          const u = String(s.ticketUrl || "").trim();
          if (u) Linking.openURL(u).catch(() => {});
          else openMapsQuery(s.mapQuery || s.title);
          popCard(w, s);
          setPeekDetailHandlers(null);
          router.back();
        },
        onNeverShow: () => {
          popCard(w, s);
          setPeekDetailHandlers(null);
          router.back();
        },
      });
      setPendingConciergeDetail({ suggestion: s, others: stack.filter((x) => x !== s), peek: true });
      void setConciergeDetailPayload({
        suggestion: s,
        others: stack.filter((x) => x !== s),
        peek: true,
      });
      router.push("/concierge-detail");
    },
    [popCard]
  );

  const commitInterested = useCallback(
    (w: AheadWindowKey, s: ConciergeSuggestion) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void recordDecayCommitted(s);
      void recordSwipeCommit(s.category || "experience");
      persistSwipeForHistory(s);
      void addPlanningConciergeMove(s);
      const u = String(s.ticketUrl || "").trim();
      if (u) Linking.openURL(u).catch(() => {});
      else openMapsQuery(s.mapQuery || s.title);
      popCard(w, s);
    },
    [popCard]
  );

  const skipCard = useCallback(
    (w: AheadWindowKey, s: ConciergeSuggestion) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      void recordDecayRejected(s);
      void recordSwipeSkip(s.category || "experience");
      void pushRecentConciergeTitle(s.title);
      persistSwipeForHistory(s);
      popCard(w, s);
    },
    [popCard]
  );

  const dateChoices = useMemo(() => {
    const out: string[] = [];
    let y = ymdToday();
    for (let i = 0; i < 90; i++) {
      out.push(y);
      y = ymdAddDays(y, 1);
    }
    return out;
  }, []);

  const sections: { key: AheadWindowKey; title: string; subtitle: string }[] = [
    { key: "tonight", title: "Tonight", subtitle: "Later today, not started yet" },
    { key: "weekend", title: "This weekend", subtitle: "Friday through Sunday" },
    { key: "date", title: "Pick a date", subtitle: pickedYmd },
    { key: "further", title: "Further out", subtitle: "Roughly 1–90 days ahead" },
  ];

  function renderDeck(w: AheadWindowKey) {
    const list = decks[w] ?? [];
    const err = errors[w];
    const ld = loading[w];

    if (ld && list.length === 0) {
      return (
        <View style={styles.deckLoading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.mutedSmall}>Pulling events…</Text>
        </View>
      );
    }
    if (err && list.length === 0) {
      return (
        <View style={styles.deckLoading}>
          <Text style={styles.errSmall}>{err}</Text>
          <Pressable
            style={styles.retrySm}
            onPress={() => void fetchAhead(w, w === "date" ? pickedYmd : undefined)}
          >
            <Text style={styles.retrySmText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    if (list.length === 0) {
      return <Text style={styles.mutedSmall}>Nothing in this window — try another section.</Text>;
    }

    return (
      <View style={styles.deckWrap}>
        <Text style={styles.deckHint}>{list.length} in this stack — right = save to Planning</Text>
        <ConciergeSwipeDeck
          suggestions={list}
          width={deckWidth}
          height={deckHeight}
          colors={{
            accent: colors.accent,
            text: colors.text,
            textMuted: colors.textMuted,
            textInverse: colors.textInverse,
          }}
          onSwipeRight={() => {
            const cur = decksRef.current[w]?.[0];
            if (cur) commitInterested(w, cur);
          }}
          onSwipeLeft={() => {
            const cur = decksRef.current[w]?.[0];
            if (cur) skipCard(w, cur);
          }}
          renderCard={(s, { isTop }) => (
            <ConciergeHeroCard
              suggestion={s}
              width={deckWidth}
              deckMaxHeight={deckHeight}
              imageGradientBottomColor={colors.bgCard}
              colors={colors}
              swipeMode
              onCardPress={
                isTop
                  ? () => {
                      const stack = decksRef.current[w] ?? [];
                      openPeek(w, s, stack);
                    }
                  : undefined
              }
              onOpenMaps={(sg) => openMapsQuery(sg.mapQuery || sg.title)}
              onOpenTickets={(sg) => {
                const u = String(sg.ticketUrl || "").trim();
                if (u) Linking.openURL(u).catch(() => {});
              }}
            />
          )}
        />
        <DeckButtons
          onNah={() => {
            const cur = decksRef.current[w]?.[0];
            if (cur) skipCard(w, cur);
          }}
          onGo={() => {
            const cur = decksRef.current[w]?.[0];
            if (cur) commitInterested(w, cur);
          }}
          colors={{
            accent: colors.accent,
            text: colors.text,
            textMuted: colors.textMuted,
            textInverse: colors.textInverse,
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.blurb}>
        Plan ahead — concerts, games, and calendar-worthy stuff. Right swipe saves to Planning (not Saved moves).
      </Text>

      {sections.map((sec) => (
        <View key={sec.key} style={styles.section}>
          <Pressable style={styles.sectionHeader} onPress={() => toggle(sec.key)}>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>{sec.title}</Text>
              <Text style={styles.sectionSub}>{sec.subtitle}</Text>
            </View>
            <Ionicons
              name={expanded[sec.key] ? "chevron-up" : "chevron-down"}
              size={22}
              color={colors.textMuted}
            />
          </Pressable>
          {expanded[sec.key] ? (
            <View style={styles.sectionBody}>
              {sec.key === "date" ? (
                <Pressable style={styles.datePickBtn} onPress={() => setDateModal(true)}>
                  <Text style={styles.datePickBtnText}>Change date ({pickedYmd})</Text>
                  <Ionicons name="calendar-outline" size={18} color={colors.accent} />
                </Pressable>
              ) : null}
              {renderDeck(sec.key)}
            </View>
          ) : null}
        </View>
      ))}

      <Modal visible={dateModal} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setDateModal(false)} />
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Pick a day</Text>
          <ScrollView style={styles.dateScroll} keyboardShouldPersistTaps="handled">
            {dateChoices.map((ymd) => (
              <Pressable
                key={ymd}
                style={[styles.dateRow, pickedYmd === ymd && styles.dateRowActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPickedYmd(ymd);
                  setDecks((prev) => ({ ...prev, date: [] }));
                  setDateModal(false);
                  void fetchAhead("date", ymd);
                }}
              >
                <Text style={styles.dateRowText}>{ymd}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.modalClose} onPress={() => setDateModal(false)}>
            <Text style={styles.modalCloseText}>Close</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(
  colors: ThemeColors,
  insetBottom: number
) {
  return StyleSheet.create({
    wrap: { paddingHorizontal: spacing.md, paddingBottom: insetBottom + spacing.xl },
    blurb: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
      marginBottom: spacing.md,
    },
    section: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.bgCard,
      marginBottom: spacing.sm,
      overflow: "hidden",
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: spacing.md,
    },
    sectionHeaderText: { flex: 1, marginRight: spacing.sm },
    sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
    sectionSub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
    sectionBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
    datePickBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
    },
    datePickBtnText: { fontSize: 14, fontWeight: "700", color: colors.text },
    deckWrap: { alignItems: "center" },
    deckHint: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textMuted,
      marginBottom: spacing.sm,
      alignSelf: "stretch",
    },
    deckLoading: { alignItems: "center", paddingVertical: spacing.lg, gap: spacing.sm },
    mutedSmall: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
    errSmall: { fontSize: 13, color: colors.textSub, textAlign: "center" },
    retrySm: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: radius.sm,
      backgroundColor: colors.accent,
    },
    retrySmText: { color: colors.textInverse, fontWeight: "700", fontSize: 13 },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    modalSheet: {
      position: "absolute",
      left: spacing.md,
      right: spacing.md,
      top: "12%",
      maxHeight: "70%",
      backgroundColor: colors.bgCard,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: spacing.sm },
    dateScroll: { maxHeight: 360 },
    dateRow: {
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: radius.sm,
    },
    dateRowActive: { backgroundColor: colors.accent + "33" },
    dateRowText: { fontSize: 15, color: colors.text, fontWeight: "600" },
    modalClose: { marginTop: spacing.sm, alignItems: "center", padding: spacing.sm },
    modalCloseText: { fontSize: 15, fontWeight: "700", color: colors.accent },
  });
}
