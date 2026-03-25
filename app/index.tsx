import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../hooks/use-theme-colors";
import type { ConciergeEnergy, ConciergeSuggestion, ConciergeTimeBudget } from "../lib/concierge-types";
import { DECK_FOCUS_EMOJI } from "../lib/deck-category-chips";
import { USER_INTEREST_CHIPS } from "../lib/user-interests";
import { font, radius, spacing } from "../lib/theme";
import { getReadableLocation } from "../lib/location";
import { getRecentConciergeTitles, pushRecentConciergeTitle } from "../lib/recent-concierge-storage";
import { buildUserContextLine } from "../lib/user-context-line";
import { useMoveStore } from "../store/move-context";
import { ConciergeSwipeDeck, DeckButtons } from "../components/concierge-swipe-deck";
import { ConciergeHeroCard } from "../components/concierge-hero-card";
import {
  setConciergeDetailPayload,
  setPendingConciergeDetail,
} from "../lib/concierge-detail-storage";
import { prefetchConciergeDetailQuick, prefetchSuggestionHeroImages } from "../lib/concierge-prefetch";
import {
  dedupeWithinList,
  getExcludeSuggestionKeys,
  persistSwipeForHistory,
  registerDeckKeys,
} from "../lib/shown-concierge-ids";
import {
  getSwipeSignalsForApi,
  recordSwipeCommit,
  recordSwipeSkip,
} from "../lib/swipe-signals-storage";
import {
  getSavedConciergeMoves,
  isConciergeMoveSaved,
  toggleSavedConciergeMove,
  type SavedConciergeMove,
} from "../lib/saved-concierge-storage";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const DECK_W = SCREEN_W - spacing.md * 2;
const SERVER_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.154:3001";

type LoadMode = "full" | "refresh" | "background";

function openMapsQuery(q: string) {
  const query = String(q || "").trim();
  if (!query) return;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  Linking.openURL(url).catch(() => {});
}

function mapApiConciergeSuggestion(x: Record<string, unknown>): ConciergeSuggestion {
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
  const genresRaw = x.movieGenres;
  const movieGenres = Array.isArray(genresRaw)
    ? genresRaw.map((g) => String(g)).filter(Boolean)
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
    movieGenres,
    movieBackdropUrl: x.movieBackdropUrl != null ? String(x.movieBackdropUrl) : undefined,
    showtimes,
    fandangoFallbackUrl:
      x.fandangoFallbackUrl != null ? String(x.fandangoFallbackUrl) : undefined,
    flavorTag: x.flavorTag != null ? String(x.flavorTag) : undefined,
    placeOpenNow:
      x.placeOpenNow === true ? true : x.placeOpenNow === false ? false : null,
    closesSoon: Boolean(x.closesSoon),
    deckRole: x.deckRole != null ? String(x.deckRole) : undefined,
    sourceType: x.sourceType != null ? String(x.sourceType) : undefined,
    cost: x.cost != null ? String(x.cost) : undefined,
    isTimeSensitive: x.isTimeSensitive === true,
    distanceText: x.distanceText != null ? String(x.distanceText) : undefined,
  };
}

export default function HomeScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(colors, insets.top, insets.bottom),
    [colors, insets.top, insets.bottom]
  );

  /** Deck fits between filters and ✕/✓ on iPhone 14-class screens (conservative reserve). */
  const DECK_HEIGHT = useMemo(() => {
    const reservedAboveDeck = 352;
    const deckButtonsAndGap = 80;
    const raw =
      SCREEN_H - insets.top - insets.bottom - reservedAboveDeck - deckButtonsAndGap;
    return Math.max(300, Math.min(458, raw));
  }, [insets.top, insets.bottom]);
  const { hasFinishedOnboarding, isLoaded, preferences, setPreferences } = useMoveStore();

  const userInterestDeckChips = useMemo(() => {
    const sel = new Set(preferences.interests ?? []);
    return USER_INTEREST_CHIPS.filter((c) => sel.has(c.key));
  }, [preferences.interests]);

  const [energy, setEnergy] = useState<ConciergeEnergy>("medium");
  const [timeBudget, setTimeBudget] = useState<ConciergeTimeBudget>("mid");
  const [suggestions, setSuggestions] = useState<ConciergeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [areaLabel, setAreaLabel] = useState("");
  const [homeTab, setHomeTab] = useState<"forYou" | "saved">("forYou");
  const [leftDismissStreak, setLeftDismissStreak] = useState(0);
  const [bookmarkSaved, setBookmarkSaved] = useState(false);
  const [savedRows, setSavedRows] = useState<SavedConciergeMove[]>([]);
  const [findingMoreDeck, setFindingMoreDeck] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Bias the next concierge request toward one interest category (chip). */
  const [deckCategoryFocus, setDeckCategoryFocus] = useState<string | null>(null);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const hasHadFocusOnce = useRef(false);
  const pendingDeckRef = useRef<ConciergeSuggestion[] | null>(null);
  const prefetchingNextDeckRef = useRef(false);
  const suggestionsLenRef = useRef(0);
  suggestionsLenRef.current = suggestions.length;

  useEffect(() => {
    if (!isLoaded) return;
    if (!hasFinishedOnboarding) {
      router.replace("/onboarding");
    }
  }, [isLoaded, hasFinishedOnboarding]);

  const fetchDeckList = useCallback(async (): Promise<ConciergeSuggestion[]> => {
    const prefs = preferencesRef.current;
    const ints = prefs.interests ?? [];
    if (ints.length === 0) {
      throw new Error("Pick at least one interest (⋯ menu → Interests) so we can suggest moves.");
    }
    const loc = await getReadableLocation();
    const place = loc.place || "near you";
    const recentSuggestions = await getRecentConciergeTitles();
    const nowIso = new Date().toISOString();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const excludeSuggestionKeys = await getExcludeSuggestionKeys();
    const swipeSignals = await getSwipeSignalsForApi();

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
        interests: ints,
        recentSuggestions,
        excludeSuggestionKeys,
        userContextLine: buildUserContextLine(prefs),
        hungerPreference: prefs.hungerPreference ?? "any",
        ageRange: prefs.ageRange ?? "prefer_not",
        swipeSignals: swipeSignals ?? undefined,
        ...(deckCategoryFocus ? { deckCategoryFocus } : {}),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" && data.error.trim()
          ? data.error.trim()
          : "Couldn’t load suggestions. Pull to try again."
      );
    }
    const rawList = Array.isArray(data.suggestions) ? data.suggestions : [];
    return dedupeWithinList(
      rawList.map((item: unknown) =>
        mapApiConciergeSuggestion(item && typeof item === "object" ? (item as Record<string, unknown>) : {})
      )
    );
  }, [energy, timeBudget, deckCategoryFocus]);

  const load = useCallback(async (mode: LoadMode = "full") => {
    if (mode === "refresh") setRefreshing(true);
    else if (mode === "full") setLoading(true);
    if (mode !== "background") setError("");
    try {
      const loc = await getReadableLocation();
      const place = loc.place || "near you";
      setAreaLabel(place);
      const list = await fetchDeckList();
      if (mode === "background" && list.length === 0) return;
      pendingDeckRef.current = null;
      setSuggestions(list);
      registerDeckKeys(list);
      setLeftDismissStreak(0);
      if (list.length === 0) {
        if (mode !== "background") setError("Nothing came back—try refresh.");
      }
    } catch (e) {
      if (mode !== "background") {
        setSuggestions([]);
        setError(e instanceof Error ? e.message : "Network hiccup. Pull to try again.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchDeckList]);

  useEffect(() => {
    if (!isLoaded || !hasFinishedOnboarding) return;
    load("full");
  }, [isLoaded, hasFinishedOnboarding, energy, timeBudget, deckCategoryFocus, load]);

  useFocusEffect(
    useCallback(() => {
      void getSavedConciergeMoves().then(setSavedRows);
      if (!isLoaded || !hasFinishedOnboarding) return;
      if (!hasHadFocusOnce.current) {
        hasHadFocusOnce.current = true;
        return;
      }
      if (suggestionsLenRef.current > 0) return;
      void load("background");
    }, [isLoaded, hasFinishedOnboarding, load])
  );

  useEffect(() => {
    const top = suggestions[0];
    const next = suggestions[1];
    if (top) void prefetchConciergeDetailQuick(top);
    if (next) void prefetchConciergeDetailQuick(next);
    prefetchSuggestionHeroImages([top?.photoUrl, next?.photoUrl]);
  }, [suggestions]);

  useEffect(() => {
    if (suggestions.length !== 2 || loading || prefetchingNextDeckRef.current) return;
    prefetchingNextDeckRef.current = true;
    void (async () => {
      try {
        const list = await fetchDeckList();
        if (list.length > 0) pendingDeckRef.current = list;
      } catch {
        /* interests empty or network — skip prefetch */
      } finally {
        prefetchingNextDeckRef.current = false;
      }
    })();
  }, [suggestions.length, loading, fetchDeckList]);

  const applyNextDeckOrEmpty = useCallback(
    (prev: ConciergeSuggestion[]) => {
      const pending = pendingDeckRef.current;
      pendingDeckRef.current = null;
      if (pending && pending.length > 0) {
        registerDeckKeys(pending);
        setFindingMoreDeck(false);
        return pending;
      }
      setFindingMoreDeck(true);
      void (async () => {
        try {
          const list = await fetchDeckList();
          registerDeckKeys(list);
          setSuggestions(list);
        } catch {
          setError("Couldn’t load the next deck.");
        } finally {
          setFindingMoreDeck(false);
        }
      })();
      return [];
    },
    [fetchDeckList]
  );

  const commitSwipeRight = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSuggestions((prev) => {
      const s = prev[0];
      if (!s) return prev;
      void recordSwipeCommit(s.category || "experience");
      persistSwipeForHistory(s);
      const payload = { suggestion: s, others: prev.slice(1) };
      setPendingConciergeDetail(payload);
      void setConciergeDetailPayload(payload);
      router.push("/concierge-detail");
      const next = prev.slice(1);
      if (next.length === 0) return applyNextDeckOrEmpty(prev);
      return next;
    });
    setLeftDismissStreak(0);
  }, [applyNextDeckOrEmpty]);

  const commitSwipeLeft = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSuggestions((prev) => {
      const s = prev[0];
      if (!s) return prev;
      void recordSwipeSkip(s.category || "experience");
      void pushRecentConciergeTitle(s.title);
      persistSwipeForHistory(s);
      const next = prev.slice(1);
      if (next.length === 0) return applyNextDeckOrEmpty(prev);
      return next;
    });
    setLeftDismissStreak((st) => {
      const n = st + 1;
      if (n >= 3) {
        void load("full");
        return 0;
      }
      return n;
    });
  }, [load, applyNextDeckOrEmpty]);

  const onBookmarkToggle = useCallback(async () => {
    const s = suggestions[0];
    if (!s) return;
    const next = await toggleSavedConciergeMove(s);
    setBookmarkSaved(next);
  }, [suggestions]);

  useEffect(() => {
    const s = suggestions[0];
    if (!s) {
      setBookmarkSaved(false);
      return;
    }
    void isConciergeMoveSaved(s).then(setBookmarkSaved);
  }, [suggestions]);

  function openMenu() {
    setMenuOpen(true);
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
    <View style={styles.rootWrap}>
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.outerScroll}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
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
        <Pressable
          style={styles.menuBtn}
          onPress={() => {
            Haptics.selectionAsync();
            openMenu();
          }}
          hitSlop={10}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </Pressable>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.menuRoot}>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuSheetContainer} pointerEvents="box-none">
            <View style={styles.menuSheet}>
              <Text style={styles.menuSheetTitle}>Elsewhere</Text>
              {(
                [
                  { label: "Interests", href: "/edit-interests" as const },
                  { label: "Your details", href: "/my-context" as Href },
                  { label: "Saved moves", href: "/saved-moves" as const },
                ] as const
              ).map((item, i, arr) => (
                <View key={item.label}>
                  <Pressable
                    style={styles.menuRow}
                    onPress={() => {
                      setMenuOpen(false);
                      router.push(item.href);
                    }}
                  >
                    <Text style={styles.menuRowText}>{item.label}</Text>
                  </Pressable>
                  {i < arr.length - 1 ? <View style={styles.menuSep} /> : null}
                </View>
              ))}
              <View style={styles.menuCancelWrap}>
                <Pressable style={styles.menuCancelBtn} onPress={() => setMenuOpen(false)}>
                  <Text style={styles.menuCancelText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Text style={styles.screenTitle}>{"What's the move?"}</Text>

      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, homeTab === "forYou" && styles.tabActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setHomeTab("forYou");
          }}
        >
          <Text style={[styles.tabText, homeTab === "forYou" && styles.tabTextActive]}>For you</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, homeTab === "saved" && styles.tabActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setHomeTab("saved");
            void getSavedConciergeMoves().then(setSavedRows);
          }}
        >
          <Text style={[styles.tabText, homeTab === "saved" && styles.tabTextActive]}>Saved</Text>
        </Pressable>
      </View>

      {homeTab === "forYou" ? (
      <>
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

        <Text style={[styles.controlLabel, { marginTop: spacing.md }]}>Hungry?</Text>
        <View style={styles.segmentRow}>
          {(
            [
              { key: "any" as const, label: "Either" },
              { key: "hungry" as const, label: "Hungry" },
              { key: "not_hungry" as const, label: "Not hungry" },
            ] as const
          ).map(({ key, label }) => {
            const active = (preferences.hungerPreference ?? "any") === key;
            return (
              <Pressable
                key={key}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPreferences({ ...preferences, hungerPreference: key });
                }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {userInterestDeckChips.length > 0 ? (
          <>
            <Text style={[styles.controlLabel, { marginTop: spacing.md }]}>Steer this deck</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryChipScroll}
              keyboardShouldPersistTaps="handled"
            >
              {userInterestDeckChips.map(({ key, label }) => {
                const emoji = DECK_FOCUS_EMOJI[key] ?? "✨";
                const active = deckCategoryFocus === key;
                return (
                  <Pressable
                    key={key}
                    style={[styles.categoryChip, active && styles.categoryChipActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setDeckCategoryFocus((prev) => (prev === key ? null : key));
                    }}
                  >
                    <Text
                      style={[styles.categoryChipText, active && styles.categoryChipTextActive]}
                      numberOfLines={1}
                    >
                      {emoji} {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}
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
      ) : suggestions.length === 0 ? (
        <View style={styles.loadingBlock}>
          {findingMoreDeck ? (
            <Text style={[styles.loadingSub, { textAlign: "center" }]}>Getting more…</Text>
          ) : (
            <>
              <Text style={styles.errorText}>You’re caught up.</Text>
              <Text style={styles.loadingSub}>Pull to refresh for a new deck.</Text>
            </>
          )}
        </View>
      ) : (
        <>
          <Text style={styles.swipeHint}>
            {suggestions.length} in this deck — swipe right to commit
          </Text>
          <View style={styles.deckWrap}>
            <ConciergeSwipeDeck
              suggestions={suggestions}
              width={DECK_W}
              height={DECK_HEIGHT}
              colors={{
                accent: colors.accent,
                text: colors.text,
                textMuted: colors.textMuted,
                textInverse: colors.textInverse,
              }}
              onSwipeRight={commitSwipeRight}
              onSwipeLeft={commitSwipeLeft}
              renderCard={(s, { isTop }) => (
                <ConciergeHeroCard
                  suggestion={s}
                  width={DECK_W}
                  deckMaxHeight={DECK_HEIGHT}
                  imageGradientBottomColor={colors.bgCard}
                  colors={colors}
                  swipeMode
                  bookmarkSaved={isTop ? bookmarkSaved : false}
                  onBookmarkPress={isTop ? () => void onBookmarkToggle() : undefined}
                  onCardPress={undefined}
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
              )}
            />
            <DeckButtons
              onNah={commitSwipeLeft}
              onGo={commitSwipeRight}
              colors={{
                accent: colors.accent,
                text: colors.text,
                textMuted: colors.textMuted,
                textInverse: colors.textInverse,
              }}
            />
          </View>
        </>
      )}
      </>
      ) : (
        <View style={styles.savedListWrap}>
          {savedRows.length === 0 ? (
            <Text style={[styles.savedEmpty, { color: colors.textMuted }]}>
              Nothing saved yet — tap the bookmark on a card to stash a move for later.
            </Text>
          ) : (
            savedRows.map((row) => (
              <Pressable
                key={row.id}
                style={[styles.savedRow, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
                onPress={async () => {
                  await setConciergeDetailPayload({ suggestion: row.suggestion, others: [] });
                  router.push("/concierge-detail");
                }}
              >
                {row.suggestion.photoUrl ? (
                  <Image
                    source={{ uri: row.suggestion.photoUrl }}
                    style={styles.savedThumb}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.savedThumb, { backgroundColor: colors.bgMuted }]} />
                )}
                <View style={styles.savedRowText}>
                  <Text style={[styles.savedRowTitle, { color: colors.text }]} numberOfLines={2}>
                    {row.suggestion.title}
                  </Text>
                  {row.suggestion.category ? (
                    <Text style={[styles.savedRowMeta, { color: colors.textMuted }]}>
                      {row.suggestion.category}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </View>
      )}
    </ScrollView>
    </View>
  );
}

function createStyles(
  colors: ReturnType<typeof useThemeColors>,
  insetTop: number,
  insetBottom: number
) {
  const topPad = Math.max(insetTop, 12);
  const bottomPad = Math.max(insetBottom, 12);
  return StyleSheet.create({
    rootWrap: {
      flex: 1,
      position: "relative",
    },
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    outerScroll: {
      flexGrow: 1,
      paddingBottom: spacing.xxl + bottomPad + 32,
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
    tabRow: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    tab: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgCard,
    },
    tabActive: {
      backgroundColor: colors.bgDark,
      borderColor: colors.bgDark,
    },
    tabText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
    },
    tabTextActive: {
      color: colors.textInverse,
    },
    deckWrap: {
      alignItems: "center",
      paddingHorizontal: spacing.md,
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
    savedListWrap: {
      paddingHorizontal: spacing.md,
      marginBottom: spacing.xl,
      gap: spacing.sm,
    },
    savedEmpty: {
      fontSize: font.sizeSm,
      lineHeight: 20,
      paddingVertical: spacing.md,
    },
    savedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    savedThumb: {
      width: 52,
      height: 52,
      borderRadius: radius.sm,
    },
    savedRowText: {
      flex: 1,
      minWidth: 0,
    },
    savedRowTitle: {
      fontSize: font.sizeMd,
      fontWeight: "700",
    },
    savedRowMeta: {
      fontSize: 12,
      marginTop: 2,
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
    categoryChipScroll: {
      flexDirection: "row",
      flexWrap: "nowrap",
      gap: 8,
      paddingVertical: 4,
      paddingRight: spacing.md,
    },
    categoryChip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgCard,
    },
    categoryChipActive: {
      backgroundColor: colors.bgDark,
      borderColor: colors.bgDark,
    },
    categoryChipText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text,
      maxWidth: 220,
    },
    categoryChipTextActive: {
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
    menuRoot: {
      flex: 1,
    },
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.55)",
    },
    menuSheetContainer: {
      flex: 1,
      justifyContent: "flex-end",
    },
    menuSheet: {
      backgroundColor: "#1a1a1a",
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 18,
      paddingBottom: bottomPad + 6,
    },
    menuSheetTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: "rgba(255,255,255,0.45)",
      textTransform: "uppercase",
      letterSpacing: 1,
      paddingHorizontal: spacing.lg,
      marginBottom: 8,
    },
    menuRow: {
      paddingVertical: 16,
      paddingHorizontal: spacing.lg,
    },
    menuRowText: {
      fontSize: 17,
      fontWeight: "600",
      color: "#FFFFFF",
    },
    menuSep: {
      height: StyleSheet.hairlineWidth,
      marginLeft: spacing.lg,
      backgroundColor: "rgba(255,255,255,0.1)",
    },
    menuCancelWrap: {
      marginTop: 8,
      paddingTop: 12,
      paddingBottom: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: "rgba(255,255,255,0.08)",
    },
    menuCancelBtn: {
      paddingVertical: 18,
      paddingHorizontal: spacing.lg,
    },
    menuCancelText: {
      fontSize: 17,
      fontWeight: "600",
      color: "rgba(255,255,255,0.55)",
      textAlign: "center",
    },
  });
}
