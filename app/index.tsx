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
import {
  canFreeUserDeckRefresh,
  canShowPaywallAfterDismiss,
  consumeDeckRefreshCredit,
  dismissPaywall,
  dismissThirdRefreshUpsell,
  expireTrialIfNeeded,
  isDevPlusUnlocked,
  isPlusEffectiveOrDev,
  isThirdRefreshUpsellDismissedToday,
  isWildcardLocked,
  loadEntitlements,
  markFiveSessionUpsellShown,
  markSharperPicksLineShown,
  markTrialEndingBannerShown,
  recordAppSessionOpen,
  shouldShowSharperPicksLine,
  shouldShowTrialEndingBanner,
} from "../lib/plus-entitlements";
import { usePlusEntitlements } from "../store/plus-context";
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
    dateBadge: x.dateBadge != null ? String(x.dateBadge) : undefined,
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
    /** Filters + tabs + swipe hint + breathing room so cards don’t cover the hint. */
    const reservedAboveDeck = 260;
    const deckButtonsAndGap = 80;
    const raw =
      SCREEN_H - insets.top - insets.bottom - reservedAboveDeck - deckButtonsAndGap;
    return Math.max(420, Math.min(580, raw));
  }, [insets.top, insets.bottom]);
  const { hasFinishedOnboarding, isLoaded, preferences, setPreferences } = useMoveStore();
  const { isPlus, loaded: plusLoaded, refresh: refreshPlus } = usePlusEntitlements();

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
  const trialPaywallShownRef = useRef(false);
  const isPlusRef = useRef(isPlus);
  isPlusRef.current = isPlus;

  const [thirdRefreshModalVisible, setThirdRefreshModalVisible] = useState(false);
  const [deckRefreshSoft, setDeckRefreshSoft] = useState(false);
  const [trialEndBannerVisible, setTrialEndBannerVisible] = useState(false);
  const [sharperPicksBannerVisible, setSharperPicksBannerVisible] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!hasFinishedOnboarding) {
      router.replace("/onboarding");
    }
  }, [isLoaded, hasFinishedOnboarding]);

  useEffect(() => {
    return () => setPeekDetailHandlers(null);
  }, []);

  const fetchDeckList = useCallback(async (): Promise<ConciergeSuggestion[]> => {
    const prefs = preferencesRef.current;
    const ints = prefs.interests ?? [];
    const plus = isPlusRef.current;
    if (ints.length === 0) {
      throw new Error("Pick at least one interest (⋯ menu → Interests) so we can suggest moves.");
    }
    const loc = await getReadableLocation();
    const place = loc.place || "near you";
    const recentSuggestions = await getRecentConciergeTitles();
    const nowIso = new Date().toISOString();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const baseExclude = await getExcludeSuggestionKeys();
    let excludeSuggestionKeys = baseExclude;
    let decayRecentNames: string[] = [];
    if (plus) {
      const decayKeys = await getDecayExcludedKeys();
      excludeSuggestionKeys = [...new Set([...baseExclude, ...decayKeys])];
      decayRecentNames = await getDecayContextForGpt();
    }
    const swipeSignals = plus ? await getSwipeSignalsForApi() : null;

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
        decayRecentNames,
        conciergeTier: plus ? "plus" : "free",
        userContextLine: buildUserContextLine(prefs),
        hungerPreference: prefs.hungerPreference ?? "any",
        ageRange: prefs.ageRange ?? "prefer_not",
        ...(swipeSignals ? { swipeSignals } : {}),
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
    if (!plus) return mapped;
    const dk = new Set(await getDecayExcludedKeys());
    return filterSuggestionsByDecay(mapped, Date.now(), dk);
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

        if (!isPlusRef.current && (mode === "full" || mode === "refresh" || mode === "background")) {
          const ok = await canFreeUserDeckRefresh();
          if (!ok) {
            if (mode !== "background") {
              const ent = await loadEntitlements();
              if (!isThirdRefreshUpsellDismissedToday(ent)) {
                setThirdRefreshModalVisible(true);
              }
              setDeckRefreshSoft(true);
              throw new Error("REFRESH_CAP");
            }
            return;
          }
        }

        const list = await fetchDeckList();
        if (mode === "background" && list.length === 0) return;
        pendingDeckRef.current = null;
        setSuggestions(list);
        registerDeckKeys(list);
        setDeckRefreshSoft(false);

        if (!isPlusRef.current && (mode === "full" || mode === "refresh" || mode === "background")) {
          const { justUsedThird } = await consumeDeckRefreshCredit();
          if (justUsedThird) {
            setThirdRefreshModalVisible(true);
          }
        }

        if (isPlusRef.current) {
          void recordDecayDeckDisplayed(list);
        }
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

  useEffect(() => {
    if (!isLoaded || !hasFinishedOnboarding || !plusLoaded) return;
    load("full");
  }, [isLoaded, hasFinishedOnboarding, plusLoaded, energy, timeBudget, deckCategoryFocus, load]);

  useFocusEffect(
    useCallback(() => {
      void getSavedConciergeMoves().then(setSavedRows);
      const isFirstHomeFocus = !hasHadFocusOnce.current;
      void (async () => {
        const ended = await expireTrialIfNeeded();
        if (ended) await refreshPlus();
        if (ended && !trialPaywallShownRef.current && !isDevPlusUnlocked()) {
          trialPaywallShownRef.current = true;
          router.push("/elsewhere-plus?source=trial_ended" as Href);
        }
        const ent = await recordAppSessionOpen();
        await refreshPlus();
        if (
          !isFirstHomeFocus &&
          !isPlusEffectiveOrDev(ent) &&
          ent.sessionOpenCount >= 5 &&
          !ent.fiveSessionUpsellShown &&
          (await canShowPaywallAfterDismiss())
        ) {
          await markFiveSessionUpsellShown();
          router.push("/elsewhere-plus?source=habit" as Href);
        }
        const latest = await loadEntitlements();
        if (shouldShowTrialEndingBanner(latest)) {
          setTrialEndBannerVisible(true);
          void markTrialEndingBannerShown();
        }
        if (shouldShowSharperPicksLine(latest)) {
          setSharperPicksBannerVisible(true);
          void markSharperPicksLineShown();
        }
      })();
      if (!isLoaded || !hasFinishedOnboarding) return;
      if (isFirstHomeFocus) {
        hasHadFocusOnce.current = true;
        return;
      }
      if (suggestionsLenRef.current > 0) return;
      void load("background");
    }, [isLoaded, hasFinishedOnboarding, load, refreshPlus])
  );

  useEffect(() => {
    const top = suggestions[0];
    const next = suggestions[1];
    if (top) void prefetchConciergeDetailQuick(top);
    if (next) void prefetchConciergeDetailQuick(next);
    prefetchSuggestionHeroImages([top?.photoUrl, next?.photoUrl]);
  }, [suggestions]);

  useEffect(() => {
    if (!isPlus || suggestions.length !== 2 || loading || prefetchingNextDeckRef.current) return;
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
  }, [isPlus, suggestions.length, loading, fetchDeckList]);

  const applyNextDeckOrEmpty = useCallback(
    (prev: ConciergeSuggestion[]) => {
      const pending = pendingDeckRef.current;
      pendingDeckRef.current = null;
      if (pending && pending.length > 0) {
        registerDeckKeys(pending);
        if (isPlusRef.current) void recordDecayDeckDisplayed(pending);
        setFindingMoreDeck(false);
        return pending;
      }
      setFindingMoreDeck(true);
      void (async () => {
        try {
          if (!isPlusRef.current) {
            const ok = await canFreeUserDeckRefresh();
            if (!ok) {
              setDeckRefreshSoft(true);
              const ent = await loadEntitlements();
              if (!isThirdRefreshUpsellDismissedToday(ent)) {
                setThirdRefreshModalVisible(true);
              }
              return;
            }
          }
          const list = await fetchDeckList();
          registerDeckKeys(list);
          if (isPlusRef.current) void recordDecayDeckDisplayed(list);
          setSuggestions(list);
          if (!isPlusRef.current) {
            const { justUsedThird } = await consumeDeckRefreshCredit();
            if (justUsedThird) setThirdRefreshModalVisible(true);
          }
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

  const quickCommitSwipeRight = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const prev = suggestionsRef.current;
    const s = prev[0];
    if (!s) return;
    if (isWildcardLocked(s, isPlusRef.current)) {
      openPlusPaywall("wildcard");
      return;
    }
    if (isPlusRef.current) void recordDecayCommitted(s);
    void recordSwipeCommit(s.category || "experience");
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
  }, [applyNextDeckOrEmpty, openPlusPaywall]);

  const openPeekDetail = useCallback(() => {
    const stack = suggestionsRef.current;
    const s = stack[0];
    if (!s) return;
    if (isWildcardLocked(s, isPlusRef.current)) {
      openPlusPaywall("wildcard");
      return;
    }
    const others = stack.slice(1);
    setPeekDetailHandlers({
      onNah: () => {
        if (isPlusRef.current) void recordDecayRejected(s);
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
        if (isPlusRef.current) void recordDecayCommitted(s);
        void recordSwipeCommit(s.category || "experience");
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSuggestions((prev) => {
      const s = prev[0];
      if (!s) return prev;
      if (isPlusRef.current) void recordDecayRejected(s);
      void recordSwipeSkip(s.category || "experience");
      if (!isWildcardLocked(s, isPlusRef.current)) {
        void pushRecentConciergeTitle(s.title);
        persistSwipeForHistory(s);
      }
      const next = prev.slice(1);
      if (next.length === 0) return applyNextDeckOrEmpty(prev);
      return next;
    });
    setLeftDismissStreak((st) => {
      const n = st + 1;
      if (n >= 3) {
        void (async () => {
          if (isPlusRef.current || (await canFreeUserDeckRefresh())) {
            void load("full");
          }
        })();
        return 0;
      }
      return n;
    });
  }, [load, applyNextDeckOrEmpty]);

  const onBookmarkToggle = useCallback(async () => {
    const s = suggestions[0];
    if (!s) return;
    const wasSaved = await isConciergeMoveSaved(s);
    const res = await toggleSavedConciergeMove(s, { plusUnlimited: isPlusRef.current });
    if (res.blockedCap) {
      openPlusPaywall("saved_cap");
      return;
    }
    if (isPlusRef.current) {
      if (res.saved && !wasSaved) void recordDecayBookmarkPinned(s);
      if (!res.saved && wasSaved) void recordDecayBookmarkUnpinned(s);
    }
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

  const menuItems = useMemo(() => {
    const rows: { label: string; href: Href }[] = [
      { label: "What's the Move? Plus", href: "/elsewhere-plus?source=menu" },
      { label: "Interests", href: "/edit-interests" },
      { label: "Your details", href: "/my-context" },
    ];
    if (isPlus) rows.push({ label: "Planning", href: "/planning-moves" });
    rows.push({ label: "Saved moves", href: "/saved-moves" });
    return rows;
  }, [isPlus]);

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

  if (!plusLoaded) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>One sec.</Text>
      </View>
    );
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

      {trialEndBannerVisible ? (
        <View style={[styles.subtleBanner, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.subtleBannerText, { color: colors.text }]}>
            Your free trial ends in 2 days. Keep Plus for $7.99/month.
          </Text>
          <Pressable
            onPress={() => {
              void markTrialEndingBannerShown();
              setTrialEndBannerVisible(false);
            }}
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {sharperPicksBannerVisible ? (
        <View style={[styles.subtleBanner, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.subtleBannerText, { color: colors.text }]}>
            Your picks are getting sharper. What’s the Move? has learned what you’re into.
          </Text>
          <Pressable
            onPress={() => {
              void markSharperPicksLineShown();
              setSharperPicksBannerVisible(false);
            }}
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {!isPlus && deckRefreshSoft ? (
        <View style={styles.softCapStrip}>
          <Text style={[styles.softCapStripText, { color: colors.textMuted }]}>
            Check back tomorrow — you’ve had a full day of fresh decks.
          </Text>
        </View>
      ) : null}

      <Modal
        visible={thirdRefreshModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setThirdRefreshModalVisible(false)}
      >
        <View style={styles.upgradeModalRoot}>
          <Pressable style={styles.menuBackdrop} onPress={() => setThirdRefreshModalVisible(false)} />
          <View style={[styles.upgradeModalCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={[styles.upgradeModalTitle, { color: colors.text }]}>
              You’ve read the room pretty hard today.
            </Text>
            <Text style={[styles.upgradeModalBody, { color: colors.textMuted }]}>
              Get unlimited refreshes with Plus.
            </Text>
            <Pressable
              style={[styles.upgradeModalPrimary, { backgroundColor: colors.accent }]}
              onPress={() => {
                setThirdRefreshModalVisible(false);
                openPlusPaywall("refresh_cap");
              }}
            >
              <Text style={[styles.upgradeModalPrimaryText, { color: colors.textInverse }]}>
                Upgrade — $7.99/month
              </Text>
            </Pressable>
            <Pressable
              style={styles.upgradeModalSecondary}
              onPress={() => {
                void dismissThirdRefreshUpsell();
                void dismissPaywall();
                setThirdRefreshModalVisible(false);
                setDeckRefreshSoft(true);
              }}
            >
              <Text style={[styles.upgradeModalSecondaryText, { color: colors.textMuted }]}>Maybe later</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
              color={homeTab === "comingUp" ? colors.textInverse : colors.text}
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
          }}
        >
          <Text style={[styles.tabText, homeTab === "saved" && styles.tabTextActive]}>Saved</Text>
        </Pressable>
      </View>

      {homeTab === "comingUp" ? (
        isPlus ? (
          <ComingUpPanel
            colors={colors}
            preferences={preferences}
            energy={energy}
            timeBudget={timeBudget}
            deckWidth={DECK_W}
            deckHeight={DECK_HEIGHT}
            isPlus
          />
        ) : (
          <View style={styles.comingUpLocked}>
            <Ionicons name="calendar-outline" size={40} color={colors.textMuted} />
            <Text style={[styles.comingUpLockedTitle, { color: colors.text }]}>
              See what’s coming up in {areaShort}
            </Text>
            <Text style={[styles.comingUpLockedBody, { color: colors.textMuted }]}>
              Concerts, events, and experiences worth planning for. Tonight, this weekend, or months out.
            </Text>
            <Pressable
              style={[styles.comingUpLockedCta, { backgroundColor: colors.accent }]}
              onPress={() => openPlusPaywall("coming_up")}
            >
              <Text style={[styles.comingUpLockedCtaText, { color: colors.textInverse }]}>
                Start free trial
              </Text>
            </Pressable>
          </View>
        )
      ) : homeTab === "forYou" ? (
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
          ) : !isPlus && deckRefreshSoft ? (
            <>
              <Text style={styles.errorText}>Check back tomorrow</Text>
              <Text style={[styles.loadingSub, { textAlign: "center" }]}>
                You’ve seen plenty for today. A new day brings a new deck.
              </Text>
            </>
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
            {suggestions.length} in this deck — tap a card to read first, or swipe right if you’re going
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
              onSwipeRight={quickCommitSwipeRight}
              onSwipeLeft={commitSwipeLeft}
              renderCard={(s, { isTop }) => (
                <ConciergeHeroCard
                  suggestion={s}
                  width={DECK_W}
                  deckMaxHeight={DECK_HEIGHT}
                  imageGradientBottomColor={colors.bgCard}
                  colors={colors}
                  swipeMode
                  wildcardLocked={isWildcardLocked(s, isPlus)}
                  onLockedWildcardPress={isTop ? () => openPlusPaywall("wildcard") : undefined}
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
      flexWrap: "wrap",
      gap: 8,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    tabInnerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    tab: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgCard,
      alignItems: "center",
      justifyContent: "center",
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
      paddingTop: spacing.sm,
      marginTop: spacing.xl,
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
      marginTop: spacing.sm,
      marginBottom: spacing.md,
      minHeight: 40,
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
  });
}
