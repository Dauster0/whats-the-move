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
  recordSwipeSkipWithReason,
  type SkipReason,
} from "../lib/swipe-signals-storage";
import {
  getSavedConciergeMoves,
  isConciergeMoveSaved,
  toggleSavedConciergeMove,
  type SavedConciergeMove,
} from "../lib/saved-concierge-storage";
import {
  getGoingMoves,
  type GoingMove,
} from "../lib/going-moves-storage";
import { GoingSheet } from "../components/going-sheet";
import {
  filterSuggestionsByDecay,
  getDecayContextForGpt,
  getDecayExcludedKeys,
  recordDecayBookmarkPinned,
  recordDecayBookmarkUnpinned,
  recordDecayCommitted,
  recordDecayDeckDisplayed,
  recordDecayRejected,
} from "../lib/suggestion-decay-storage";
import { setPeekDetailHandlers } from "../lib/peek-detail-handlers";
import { ComingUpPanel } from "../components/coming-up-panel";
import {
  saveCommittedMove,
  getPendingCommittedCheckIn,
  dismissCommittedCheckIn,
} from "../lib/committed-move-storage";

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

export default function HomeScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(colors, insets.top, insets.bottom),
    [colors, insets.top, insets.bottom]
  );

  /** Deck height: topBar + tabRow above; deck buttons below. Filters are hidden by default. */
  const DECK_HEIGHT = useMemo(() => {
    const aboveDeck = 110; // topBar ~50 + tabRow ~44 + small gap
    const belowDeck = 90;  // deck buttons + breathing room
    const raw = SCREEN_H - insets.top - insets.bottom - aboveDeck - belowDeck;
    return Math.max(420, Math.min(560, raw));
  }, [insets.top, insets.bottom]);
  const [cardAreaHeight, setCardAreaHeight] = useState(DECK_HEIGHT);
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
  const [homeTab, setHomeTab] = useState<"forYou" | "comingUp" | "saved">("forYou");
  const [, setLeftDismissStreak] = useState(0);
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
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;


  const [postMoveCheckIn, setPostMoveCheckIn] = useState<{ title: string; category: string } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const swipeHintShownRef = useRef(false);
  const [goingSheetSuggestion, setGoingSheetSuggestion] = useState<ConciergeSuggestion | null>(null);
  const [goingRows, setGoingRows] = useState<GoingMove[]>([]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!hasFinishedOnboarding) {
      router.replace("/onboarding");
    }
  }, [isLoaded, hasFinishedOnboarding]);

  useEffect(() => {
    return () => setPeekDetailHandlers(null);
  }, []);

  useEffect(() => {
    if (!showSwipeHint) return;
    const t = setTimeout(() => setShowSwipeHint(false), 2500);
    return () => clearTimeout(t);
  }, [showSwipeHint]);

  const fetchDeckList = useCallback(async (): Promise<ConciergeSuggestion[]> => {
    const prefs = preferencesRef.current;
    const ints = prefs.interests ?? [];
    if (ints.length === 0) {
      throw new Error("Pick at least one interest (⋯ menu → Interests) so we can suggest moves.");
    }
    const loc = await getReadableLocation();
    setLocationDenied(loc.lat === null);
    const place = loc.place || "near you";
    const recentSuggestions = await getRecentConciergeTitles();
    const nowIso = new Date().toISOString();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const baseExclude = await getExcludeSuggestionKeys();
    let excludeSuggestionKeys = baseExclude;
    const decayKeys = await getDecayExcludedKeys();
    excludeSuggestionKeys = [...new Set([...baseExclude, ...decayKeys])];
    const decayRecentNames = await getDecayContextForGpt();
    const swipeSignals = await getSwipeSignalsForApi();
    const savedMoves = await getSavedConciergeMoves();
    const savedMoveTitles = savedMoves.slice(0, 20).map((m) => m.suggestion.title);

    const res = await fetch(`${SERVER_URL}/concierge-recommendations`, {
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
        recentSuggestions,
        excludeSuggestionKeys,
        decayRecentNames,
        conciergeTier: "plus",
        userContextLine: buildUserContextLine(prefs),
        hungerPreference: prefs.hungerPreference ?? "any",
        ageRange: prefs.ageRange ?? "prefer_not",
        transportMode: prefs.transportMode ?? "driving",
        ...(swipeSignals ? { swipeSignals } : {}),
        ...(savedMoveTitles.length > 0 ? { savedMoveTitles } : {}),
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
    const mapped = dedupeWithinList(
      rawList.map((item: unknown) =>
        mapApiConciergeSuggestion(item && typeof item === "object" ? (item as Record<string, unknown>) : {})
      )
    );
    // Server already filters by decay keys — no need to re-filter client-side
    return mapped;
  }, [energy, timeBudget, deckCategoryFocus]);

  const load = useCallback(
    async (mode: LoadMode = "full") => {
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
        if (list.length > 0 && !swipeHintShownRef.current) {
          swipeHintShownRef.current = true;
          setShowSwipeHint(true);
        }

        void recordDecayDeckDisplayed(list);
        setLeftDismissStreak(0);
        if (list.length === 0) {
          if (mode !== "background") setError("Nothing came back—try refresh.");
        }
      } catch (e) {
        if (e instanceof Error && e.message === "REFRESH_CAP") {
          /* keep current deck */
        } else if (mode !== "background") {
          setSuggestions([]);
          setError(e instanceof Error ? e.message : "Network hiccup. Pull to try again.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchDeckList]
  );

  // Initial load only — filters are applied when the user taps "Find moves"
  useEffect(() => {
    if (!isLoaded || !hasFinishedOnboarding) return;
    load("full");
  }, [isLoaded, hasFinishedOnboarding]);

  useFocusEffect(
    useCallback(() => {
      void getSavedConciergeMoves().then(setSavedRows);
      void getGoingMoves().then(setGoingRows);
      const isFirstHomeFocus = !hasHadFocusOnce.current;
      void (async () => {
        /* Plus/trial logic removed */
      })();
      if (!isLoaded || !hasFinishedOnboarding) return;
      if (isFirstHomeFocus) {
        hasHadFocusOnce.current = true;
        return;
      }
      if (suggestionsLenRef.current > 0) return;
      void load("background");
      void getPendingCommittedCheckIn().then((pending) => {
        if (pending) setPostMoveCheckIn(pending);
      });
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
    if (suggestions.length > 2 || loading || prefetchingNextDeckRef.current) return;
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
        void recordDecayDeckDisplayed(pending);
        setFindingMoreDeck(false);
        return pending;
      }
      setFindingMoreDeck(true);
      void (async () => {
        try {
          const list = await fetchDeckList();
          registerDeckKeys(list);
          void recordDecayDeckDisplayed(list);
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

  const openPlusPaywall = useCallback((source: string) => {
    router.push(`/elsewhere-plus?source=${encodeURIComponent(source)}` as Href);
  }, []);

  // Called when user confirms "I'm going" in the sheet (card already popped)
  const handleSheetConfirm = useCallback((s: ConciergeSuggestion) => {
    void recordDecayCommitted(s);
    void recordSwipeCommit(s.category || "experience");
    void saveCommittedMove(s.title, s.category || "experience");
    persistSwipeForHistory(s);
    const u = String(s.ticketUrl || "").trim();
    if (u) Linking.openURL(u).catch(() => {});
    else openMapsQuery(s.mapQuery || s.title);
    setGoingSheetSuggestion(null);
  }, []);

  // Called when user taps "Actually, not sure yet" — re-insert the card
  const handleSheetCancel = useCallback((s: ConciergeSuggestion) => {
    setSuggestions((prev) => [s, ...prev]);
    setGoingSheetSuggestion(null);
  }, []);

  const quickCommitSwipeRight = useCallback(() => {
    setShowSwipeHint(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const s = suggestionsRef.current[0];
    if (!s) return;
    // Pop card immediately so deck advances
    setSuggestions((latest) => {
      const top = latest[0];
      if (!top || top !== s) return latest;
      const next = latest.slice(1);
      if (next.length === 0) return applyNextDeckOrEmpty(latest);
      return next;
    });
    setLeftDismissStreak(0);
    // Show Going Sheet — commit only when user confirms
    setGoingSheetSuggestion(s);
  }, [applyNextDeckOrEmpty]);

  const openPeekDetail = useCallback(() => {
    const stack = suggestionsRef.current;
    const s = stack[0];
    if (!s) return;
    const others = stack.slice(1);
    setPeekDetailHandlers({
      onNah: () => {
        void recordDecayRejected(s);
        void recordSwipeSkip(s.category || "experience");
        void pushRecentConciergeTitle(s.title);
        persistSwipeForHistory(s);
        setSuggestions((latest) => {
          const top = latest[0];
          if (!top || top !== s) return latest;
          const next = latest.slice(1);
          if (next.length === 0) return applyNextDeckOrEmpty(latest);
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
        setPeekDetailHandlers(null);
        router.back();
      },
      onCommit: () => {
        void recordDecayCommitted(s);
        void recordSwipeCommit(s.category || "experience");
        void saveCommittedMove(s.title, s.category || "experience");
        persistSwipeForHistory(s);
        const u = String(s.ticketUrl || "").trim();
        if (u) Linking.openURL(u).catch(() => {});
        else openMapsQuery(s.mapQuery || s.title);
        setSuggestions((latest) => {
          const top = latest[0];
          if (!top || top !== s) return latest;
          const next = latest.slice(1);
          if (next.length === 0) return applyNextDeckOrEmpty(latest);
          return next;
        });
        setLeftDismissStreak(0);
        setPeekDetailHandlers(null);
        router.back();
      },
      onNeverShow: () => {
        setSuggestions((latest) => {
          const top = latest[0];
          if (!top || top !== s) return latest;
          const next = latest.slice(1);
          if (next.length === 0) return applyNextDeckOrEmpty(latest);
          return next;
        });
        setPeekDetailHandlers(null);
        router.back();
      },
    });
    setPendingConciergeDetail({ suggestion: s, others, peek: true });
    void setConciergeDetailPayload({ suggestion: s, others, peek: true });
    router.push("/concierge-detail");
  }, [applyNextDeckOrEmpty, openPlusPaywall]);

  const commitSwipeLeft = useCallback(() => {
    setShowSwipeHint(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    let skippedCategory = "experience";
    setSuggestions((prev) => {
      const s = prev[0];
      if (!s) return prev;
      skippedCategory = s.category || "experience";
      void recordDecayRejected(s);
      void recordSwipeSkip(skippedCategory);
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
    const wasSaved = await isConciergeMoveSaved(s);
    const res = await toggleSavedConciergeMove(s, {});
    if (res.saved && !wasSaved) void recordDecayBookmarkPinned(s);
    if (!res.saved && wasSaved) void recordDecayBookmarkUnpinned(s);
    setBookmarkSaved(res.saved);
  }, [suggestions, openPlusPaywall]);

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

  const areaShort = areaLabel.split(",")[0]?.trim() || "your area";

  const menuItems = useMemo((): { label: string; href: Href }[] => [
    { label: "Interests", href: "/edit-interests" },
    { label: "Your details", href: "/my-context" },
    { label: "Planning", href: "/planning-moves" },
    { label: "Saved moves", href: "/saved-moves" },
  ], []);

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
      <View style={styles.topBar}>
        {/* Branding */}
        <View style={styles.branding}>
          <View style={styles.brandIcon}>
            <Ionicons name="sparkles" size={13} color="#1A1A1A" />
          </View>
          <View>
            <Text style={styles.brandName}>What's the Move</Text>
            <Text style={styles.brandLocation} numberOfLines={1}>{areaLabel || "Near you"}</Text>
          </View>
        </View>
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
              <Text style={styles.menuSheetTitle}>What's the Move?</Text>
              {menuItems.map((item, i, arr) => (
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
          style={[styles.tab, homeTab === "comingUp" && styles.tabActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setHomeTab("comingUp");
          }}
        >
          <View style={styles.tabInnerRow}>
            <Ionicons
              name="calendar-outline"
              size={16}
              color={homeTab === "comingUp" ? "#111111" : "#888888"}
            />
            <Text
              style={[styles.tabText, homeTab === "comingUp" && styles.tabTextActive]}
              numberOfLines={1}
            >
              Coming up
            </Text>
          </View>
        </Pressable>
        <Pressable
          style={[styles.tab, homeTab === "saved" && styles.tabActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setHomeTab("saved");
            void getSavedConciergeMoves().then(setSavedRows);
            void getGoingMoves().then(setGoingRows);
          }}
        >
          <Text style={[styles.tabText, homeTab === "saved" && styles.tabTextActive]}>Saved</Text>
        </Pressable>
      </View>

      {homeTab === "comingUp" ? (
        <ComingUpPanel
          colors={colors}
          preferences={preferences}
          energy={energy}
          timeBudget={timeBudget}
          deckWidth={DECK_W}
          deckHeight={DECK_HEIGHT}
        />
      ) : homeTab === "forYou" ? (
      <View style={styles.forYouWrap}>
        {locationDenied ? (
          <Pressable style={styles.locationBanner} onPress={() => Linking.openSettings()}>
            <Text style={styles.locationBannerText}>
              Enable location for better picks — tap to open Settings
            </Text>
          </Pressable>
        ) : null}

        {/* Right Now button */}
        <Pressable
          style={styles.rightNowBtn}
          onPress={() => { Haptics.selectionAsync(); router.push("/right-now"); }}
        >
          <Text style={styles.rightNowBtnText}>What can I do right now? →</Text>
        </Pressable>

        {/* Card area — fills remaining space */}
        <View
          style={styles.cardArea}
          onLayout={(e) => setCardAreaHeight(e.nativeEvent.layout.height)}
        >
          {loading && suggestions.length === 0 ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.loadingBlurb}>Reading the room…</Text>
              <Text style={styles.loadingSub}>Pulling what’s open, what’s on, and what fits you.</Text>
            </View>
          ) : error && suggestions.length === 0 ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator size="small" color="#F5F0E8" />
              <Text style={styles.loadingBlurb}>Finding your moves...</Text>
              <Pressable
                hitSlop={12}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  load("full");
                }}
              >
                <Text style={styles.retryLink}>Taking too long? Tap to retry</Text>
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
          ) : cardAreaHeight > 0 ? (
            <View style={[styles.deckWrap, { height: cardAreaHeight }]}>
              <ConciergeSwipeDeck
                suggestions={suggestions}
                width={DECK_W}
                height={cardAreaHeight}
                colors={{
                  accent: colors.accent,
                  text: colors.text,
                  textMuted: colors.textMuted,
                  textInverse: colors.textInverse,
                }}
                onSwipeRight={quickCommitSwipeRight}
                onSwipeLeft={commitSwipeLeft}
                renderCard={(s, { isTop }) => (
                  <ConciergeHeroCard
                    suggestion={s}
                    width={DECK_W}
                    deckMaxHeight={cardAreaHeight}
                    imageGradientBottomColor={colors.bgCard}
                    colors={colors}
                    swipeMode
                    bookmarkSaved={isTop ? bookmarkSaved : false}
                    onBookmarkPress={isTop ? () => void onBookmarkToggle() : undefined}
                    onCardPress={isTop ? openPeekDetail : undefined}
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
              {showSwipeHint ? (
                <View pointerEvents="none" style={styles.swipeHint}>
                  <Text style={styles.swipeHintText}>← swipe to skip · swipe to go →</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Bottom panel: filter pills then Nah / I’m going */}
        <View style={styles.bottomPanel}>
          <Text style={styles.filterLabel}>I want something:</Text>
          <View style={styles.energyPillRow}>
            {(
              [
                { key: "low" as const, label: "Chill" },
                { key: "medium" as const, label: "Energetic" },
                { key: "high" as const, label: "Either" },
              ] as const
            ).map(({ key, label }) => {
              const active = energy === key;
              return (
                <Pressable
                  key={key}
                  style={[styles.energyPill, active && styles.energyPillActive]}
                  onPress={() => { Haptics.selectionAsync(); setEnergy(key); }}
                >
                  <Text style={[styles.energyPillText, active && styles.energyPillTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.energyPillRow}>
            {(
              [
                { key: "30min" as const, label: "30 min" },
                { key: "mid" as const, label: "1–3 hrs" },
                { key: "allday" as const, label: "No rush" },
              ] as const
            ).map(({ key, label }) => {
              const active = timeBudget === key;
              return (
                <Pressable
                  key={key}
                  style={[styles.energyPill, active && styles.energyPillActive]}
                  onPress={() => { Haptics.selectionAsync(); setTimeBudget(key); }}
                >
                  <Text style={[styles.energyPillText, active && styles.energyPillTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {suggestions.length > 0 ? (
            <>
              <View style={styles.rejectionRow}>
                <Text style={styles.rejectionLabel}>Why not?</Text>
                {(
                  [
                    { key: "too_far" as SkipReason, label: "Too far" },
                    { key: "too_expensive" as SkipReason, label: "Too expensive" },
                    { key: "not_today" as SkipReason, label: "Not today" },
                    { key: "already_been" as SkipReason, label: "Already been" },
                    { key: "not_my_thing" as SkipReason, label: "Not my thing" },
                  ] as const
                ).map(({ key, label }) => (
                  <Pressable
                    key={key}
                    style={styles.rejectionChip}
                    onPress={() => {
                      Haptics.selectionAsync();
                      const category = suggestions[0]?.category || "experience";
                      void recordSwipeSkipWithReason(category, key);
                    }}
                  >
                    <Text style={styles.rejectionChipText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <DeckButtons
                onNah={commitSwipeLeft}
                onGo={quickCommitSwipeRight}
                colors={{
                  accent: colors.accent,
                  text: colors.text,
                  textMuted: colors.textMuted,
                  textInverse: colors.textInverse,
                }}
              />
            </>
          ) : null}
        </View>
      </View>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.savedListWrap}>
          {/* Going section */}
          {goingRows.length > 0 ? (
            <>
              <Text style={[styles.savedSectionHeader, { color: colors.text }]}>Going</Text>
              {goingRows.map((row) => (
                <Pressable
                  key={row.id}
                  style={[styles.savedRow, { borderColor: "#D4A857", backgroundColor: colors.bgCard }]}
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
                    <Text style={[styles.savedRowMeta, { color: "#D4A857" }]} numberOfLines={1}>
                      {[row.suggestion.startTime, row.suggestion.venueName].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={20} color="#D4A857" />
                </Pressable>
              ))}
              <Text style={[styles.savedSectionHeader, { color: colors.text, marginTop: 16 }]}>Saved</Text>
            </>
          ) : null}
          {savedRows.length === 0 && goingRows.length === 0 ? (
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
                  <Text style={[styles.savedRowMeta, { color: colors.textMuted }]} numberOfLines={1}>
                    {[
                      row.suggestion.category,
                      row.suggestion.dateBadge,
                      row.suggestion.startTime,
                    ].filter(Boolean).join(" · ")}
                  </Text>
                  {(() => {
                    const iso = row.suggestion.showtimes?.[0]?.startIso;
                    if (!iso) return null;
                    const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
                    if (diff <= 0) return null;
                    return (
                      <Text style={[styles.savedRowMeta, { color: colors.accent }]}>
                        {diff === 1 ? "Tomorrow" : `In ${diff} days`}
                      </Text>
                    );
                  })()}
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </View>
        </ScrollView>
      )}

    {/* Post-move check-in modal */}
    <Modal
      visible={!!postMoveCheckIn}
      transparent
      animationType="fade"
      onRequestClose={() => {
        void dismissCommittedCheckIn();
        setPostMoveCheckIn(null);
      }}
    >
      <View style={styles.checkInRoot}>
        <Pressable
          style={styles.checkInBackdrop}
          onPress={() => {
            void dismissCommittedCheckIn();
            setPostMoveCheckIn(null);
          }}
        />
        <View style={[styles.checkInCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.checkInTitle, { color: colors.text }]}>
            How did it go?
          </Text>
          <Text style={[styles.checkInSub, { color: colors.textMuted }]} numberOfLines={2}>
            {postMoveCheckIn?.title}
          </Text>
          <View style={styles.checkInRow}>
            {(
              [
                { label: "Loved it" },
                { label: "It was ok" },
                { label: "Didn't go" },
              ] as const
            ).map(({ label }) => (
              <Pressable
                key={label}
                style={[styles.checkInOption, { borderColor: colors.border, backgroundColor: colors.bg }]}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  void dismissCommittedCheckIn();
                  setPostMoveCheckIn(null);
                }}
              >
                <Text style={[styles.checkInOptionText, { color: colors.text }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
    <GoingSheet
      suggestion={goingSheetSuggestion}
      onConfirm={handleSheetConfirm}
      onCancel={() => {
        if (goingSheetSuggestion) handleSheetCancel(goingSheetSuggestion);
      }}
    />
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
      fontWeight: "700",
      color: colors.textSub,
      letterSpacing: -0.1,
    },
    branding: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    brandIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: "#F5F0E8",
      alignItems: "center",
      justifyContent: "center",
    },
    brandName: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.3,
    },
    brandLocation: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: "500",
      marginTop: 1,
    },
    bottomPanel: {
      gap: 8,
      paddingBottom: 16,
    },
    filterLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textMuted,
      paddingHorizontal: spacing.md,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    energyPillRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: spacing.md,
    },
    energyPill: {
      flex: 1,
      height: 38,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "#333333",
      backgroundColor: "#1e1e1e",
      alignItems: "center",
      justifyContent: "center",
    },
    energyPillActive: {
      backgroundColor: "#F5F0E8",
      borderColor: "#F5F0E8",
    },
    energyPillText: {
      fontSize: 13,
      fontWeight: "600",
      color: "#888888",
    },
    energyPillTextActive: {
      color: "#111111",
      fontWeight: "700",
    },
    filterBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginHorizontal: spacing.md,
      marginBottom: spacing.xs,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgCard,
    },
    filterBarText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textMuted,
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
    filterBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgCard,
    },
    filterBtnActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    filterBtnText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textSub,
    },
    filterBtnTextActive: {
      color: "#1C1916",
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
      gap: 6,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    tabInnerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    tab: {
      flex: 1,
      minWidth: 0,
      height: 38,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "#333333",
      backgroundColor: "#1e1e1e",
      alignItems: "center",
      justifyContent: "center",
    },
    tabActive: {
      backgroundColor: "#F5F0E8",
      borderColor: "#F5F0E8",
    },
    tabText: {
      fontSize: 13,
      fontWeight: "600",
      color: "#888888",
    },
    tabTextActive: {
      color: "#111111",
      fontWeight: "700",
    },
    rejectionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    rejectionLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textMuted,
    },
    rejectionChip: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgCard,
    },
    rejectionChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text,
    },
    forYouWrap: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    cardArea: {
      flex: 1,
    },
    deckWrap: {
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
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
      marginBottom: spacing.sm,
    },
    controlFilterRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 6,
    },
    controlLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textMuted,
      width: 52,
    },
    segmentRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    segment: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      height: 38,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "#333333",
      backgroundColor: "#1e1e1e",
    },
    segmentActive: {
      backgroundColor: "#F5F0E8",
      borderColor: "#F5F0E8",
    },
    segmentText: {
      fontSize: 13,
      fontWeight: "600",
      color: "#888888",
    },
    segmentTextActive: {
      color: "#111111",
      fontWeight: "700",
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
      backgroundColor: colors.accent + "28",
      borderColor: colors.accent,
    },
    categoryChipText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSub,
      maxWidth: 220,
    },
    categoryChipTextActive: {
      color: colors.accent,
    },
    swipeHint: {
      position: "absolute" as const,
      bottom: 8,
      left: 0,
      right: 0,
      alignItems: "center" as const,
      zIndex: 20,
    },
    swipeHintText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textMuted,
      backgroundColor: "rgba(0,0,0,0.45)",
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: radius.full,
      overflow: "hidden" as const,
    },
    goToast: {
      position: "absolute" as const,
      bottom: 12,
      left: 16,
      right: 16,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      backgroundColor: "rgba(20,20,20,0.92)",
      borderRadius: radius.md,
      paddingVertical: 10,
      paddingHorizontal: 16,
      zIndex: 30,
    },
    goToastText: {
      flex: 1,
      fontSize: 13,
      fontWeight: "600",
      color: "#fff",
      marginRight: 12,
    },
    goToastCancel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.accent,
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
    findMovesBtn: {
      marginHorizontal: spacing.md,
      marginBottom: spacing.xs,
      height: 56,
      borderRadius: 14,
      backgroundColor: "#F5F0E8",
      alignItems: "center",
      justifyContent: "center",
    },
    findMovesBtnText: {
      fontSize: 16,
      fontWeight: "700",
      color: "#111111",
    },
    retryLink: {
      marginTop: spacing.md,
      fontSize: 13,
      fontWeight: "500",
      color: colors.textMuted,
      textAlign: "center",
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
    subtleBanner: {
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
      borderWidth: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    subtleBannerText: {
      flex: 1,
      fontSize: 13,
      fontWeight: "600",
      lineHeight: 18,
    },
    softCapStrip: {
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    softCapStripText: {
      fontSize: 12,
      fontWeight: "600",
      textAlign: "center",
      lineHeight: 17,
    },
    upgradeModalRoot: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
    },
    upgradeModalCard: {
      borderRadius: radius.md,
      borderWidth: 1,
      padding: spacing.lg,
      gap: spacing.md,
    },
    upgradeModalTitle: {
      fontSize: 18,
      fontWeight: "800",
      lineHeight: 24,
    },
    upgradeModalBody: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
    },
    upgradeModalPrimary: {
      paddingVertical: 14,
      borderRadius: radius.sm,
      alignItems: "center",
    },
    upgradeModalPrimaryText: {
      fontSize: 16,
      fontWeight: "800",
    },
    upgradeModalSecondary: {
      alignItems: "center",
      paddingVertical: 4,
    },
    upgradeModalSecondaryText: {
      fontSize: 14,
      fontWeight: "600",
    },
    comingUpLocked: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xl,
      alignItems: "center",
      gap: spacing.md,
      minHeight: 320,
    },
    comingUpLockedTitle: {
      fontSize: 22,
      fontWeight: "800",
      textAlign: "center",
      lineHeight: 28,
    },
    comingUpLockedBody: {
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
      fontWeight: "600",
    },
    comingUpLockedCta: {
      marginTop: spacing.sm,
      paddingVertical: 14,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.md,
    },
    comingUpLockedCtaText: {
      fontSize: 16,
      fontWeight: "800",
    },
    checkInRoot: {
      flex: 1,
      justifyContent: "flex-end",
    },
    checkInBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    checkInCard: {
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: spacing.lg,
      paddingBottom: Math.max(bottomPad + spacing.md, spacing.xl),
    },
    checkInTitle: {
      fontSize: font.sizeXl,
      fontWeight: "800",
      marginBottom: 6,
    },
    checkInSub: {
      fontSize: font.sizeMd,
      marginBottom: spacing.lg,
    },
    checkInRow: {
      flexDirection: "row",
      gap: 10,
    },
    checkInOption: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      gap: 6,
    },
    checkInEmoji: {
      fontSize: 26,
    },
    checkInOptionText: {
      fontSize: 12,
      fontWeight: "700",
    },
    locationBanner: {
      marginHorizontal: spacing.md,
      marginBottom: spacing.xs,
      backgroundColor: "rgba(255,255,255,0.07)",
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    locationBannerText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textMuted,
      textAlign: "center",
    },
    rightNowBtn: {
      marginHorizontal: spacing.md,
      marginBottom: 8,
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      backgroundColor: "rgba(212,168,87,0.14)",
      borderWidth: 1,
      borderColor: "rgba(212,168,87,0.35)",
      alignItems: "center",
    },
    rightNowBtnText: {
      fontSize: font.sizeSm,
      fontWeight: "700",
      color: "#D4A857",
      letterSpacing: 0.2,
    },
    savedSectionHeader: {
      fontSize: font.sizeSm,
      fontWeight: "700",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      marginBottom: 8,
      marginTop: 4,
    },
  });
}
