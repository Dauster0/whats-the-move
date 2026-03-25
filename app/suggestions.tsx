import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../hooks/use-theme-colors";
import { getColors, radius } from "../lib/theme";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getQuickActionForMove, openQuickAction } from "../lib/action-links";
import {
  FeedbackValue,
  getFeedbackMap,
  getSuggestionFeedback,
  setSuggestionFeedback,
} from "../lib/feedback-storage";
import {
  addHiddenSuggestion,
  getHiddenSuggestions,
} from "../lib/hidden-suggestions-storage";
import { getReadableLocation } from "../lib/location";
import {
  EngineSuggestion,
  buildEngineSuggestions,
  getTimeOfDay,
} from "../lib/suggestion-engine";
import { getWeatherType } from "../lib/weather";
import { useMoveStore } from "../store/move-context";

function shuffleArray<T>(arr: T[]) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getTimeLabel(weather: string) {
  if (weather === "rain") return "Rainy day picks";
  const t = getTimeOfDay();
  if (t === "morning") return "Morning picks";
  if (t === "midday") return "Midday reset";
  if (t === "afternoon") return "Afternoon ideas";
  if (t === "evening") return "Evening ideas";
  return "Night wind-down";
}

function getVibeLabel(move: EngineSuggestion) {
  if (move.category === "micro") return "Quick reset";
  if (move.category === "social") return "Social nudge";
  return "Real-world idea";
}

function filterHiddenMoves(moves: EngineSuggestion[], hiddenIds: Set<string>) {
  return moves.filter((m) => !hiddenIds.has(m.id));
}

function applyFeedbackScore(
  move: EngineSuggestion,
  feedbackMap: Map<string, { value: FeedbackValue }>
) {
  const entry = feedbackMap.get(move.id);
  if (!entry) return 0;
  return entry.value === "liked" ? 12 : -12;
}

function makeFallbackSuggestions(area: string): EngineSuggestion[] {
  return [
    {
      id: "fallback-sunset",
      type: "generic",
      title: `Find a sunset spot in ${area === "near you" ? "your area" : area}`,
      subtitle: "A better long-form fallback",
      reason: "Still more meaningful than a vague filler suggestion.",
      category: "short",
      durationMinutes: 75,
      tags: ["experience", "outdoor", "sunset"],
      score: 1,
    },
    {
      id: "fallback-walk",
      type: "generic",
      title: "Go for a 15-minute walk with no phone in your hand",
      subtitle: "A clean mental reset",
      reason: "No planning required, just movement and a change of scenery.",
      category: "short",
      durationMinutes: 15,
      tags: ["outdoor", "calm"],
      score: 1,
    },
    {
      id: "fallback-movie",
      type: "generic",
      title: "Go see a movie tonight",
      subtitle: "An easy structured plan",
      reason: "A more worthwhile fallback than another vague suggestion.",
      category: "short",
      durationMinutes: 120,
      tags: ["indoor", "experience"],
      score: 1,
    },
  ];
}

function buildQueue(
  sourcePool: EngineSuggestion[],
  min: number,
  max: number,
  feedbackMap: Map<string, { value: FeedbackValue }>,
  excludeId?: string
) {
  const withoutCurrent = excludeId
    ? sourcePool.filter((m) => m.id !== excludeId)
    : [...sourcePool];

  let eligible = withoutCurrent.filter(
    (m) => m.durationMinutes >= min && m.durationMinutes <= max
  );

  if (eligible.length < 3 && min >= 60) {
  eligible = withoutCurrent.filter((m) => m.durationMinutes >= 60);
}

if (eligible.length < 3 && min >= 30 && min < 60) {
  eligible = withoutCurrent.filter((m) => m.durationMinutes >= 30);
}

if (eligible.length < 3 && min >= 15 && max <= 30) {
  eligible = withoutCurrent.filter(
    (m) => m.durationMinutes >= 15 && m.durationMinutes <= 40
  );
}

if (eligible.length < 3 && min < 15) {
  eligible = withoutCurrent.filter((m) => m.durationMinutes <= 25);
}

if (eligible.length === 0 && min >= 60) {
  eligible = withoutCurrent.filter((m) => m.durationMinutes >= 60);
}

if (eligible.length === 0) {
  eligible = withoutCurrent.filter((m) => m.durationMinutes >= min);
}

  const ranked = eligible
    .map((move) => ({
      ...move,
      score:
        (move.score ?? 0) +
        applyFeedbackScore(move, feedbackMap) +
        Math.random() * 0.25,
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const topChunk = ranked.slice(0, Math.max(8, Math.min(12, ranked.length)));
  return shuffleArray(topChunk);
}

export default function SuggestionsScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { preferences } = useMoveStore();
  const { minMinutes, maxMinutes } = useLocalSearchParams<{
    minMinutes?: string;
    maxMinutes?: string;
  }>();

  const min = Number(minMinutes) || 1;
  const max = Number(maxMinutes) || 10;

  const [area, setArea] = useState("near you");
  const [weather, setWeather] = useState<"sunny" | "rain" | "fog" | "snow">(
    "sunny"
  );
  const [move, setMove] = useState<EngineSuggestion | null>(null);
  const [passedCount, setPassedCount] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [feedbackState, setFeedbackState] = useState<FeedbackValue | null>(null);
  const [loadMessage, setLoadMessage] = useState(
    "Trying to find a move that actually sounds worth doing."
  );

  const poolRef = useRef<EngineSuggestion[]>([]);
  const queueRef = useRef<EngineSuggestion[]>([]);
  const moveRef = useRef<EngineSuggestion | null>(null);
  const hiddenIdsRef = useRef<Set<string>>(new Set());
  const feedbackMapRef = useRef<Map<string, { value: FeedbackValue }>>(new Map());
  const hasLoadedRef = useRef(false);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    moveRef.current = move;

    if (!move) {
      setFeedbackState(null);
      return;
    }

    const existing = feedbackMapRef.current.get(move.id);
    setFeedbackState(existing?.value ?? null);
  }, [move]);

  function refillQueue(excludeId?: string) {
    const rebuilt = buildQueue(
      filterHiddenMoves(poolRef.current, hiddenIdsRef.current),
      min,
      max,
      feedbackMapRef.current,
      excludeId
    );

    queueRef.current = rebuilt;
    return rebuilt;
  }

  function showNextMove() {
    const currentId = moveRef.current?.id;
    queueRef.current = queueRef.current.filter((m) => m.id !== currentId);

    if (queueRef.current.length === 0) {
      refillQueue(currentId);
    }

    let next = queueRef.current.shift() ?? null;

    if (!next) {
      const fallbackQueue = refillQueue(currentId);
      next = fallbackQueue.shift() ?? null;
      queueRef.current = fallbackQueue;
    }

    if (!next) return;

    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    setInfoOpen(false);
    setMove(next);
    setPassedCount((c) => c + 1);
  }

  async function saveFeedback(value: FeedbackValue) {
    if (!moveRef.current) return;

    const current = moveRef.current;

    await setSuggestionFeedback({
      id: current.id,
      title: current.title,
      category: current.category,
      value,
      updatedAt: new Date().toISOString(),
    });

    const fresh = await getSuggestionFeedback();
    feedbackMapRef.current = getFeedbackMap(fresh);
    setFeedbackState(value);

    queueRef.current = buildQueue(
      filterHiddenMoves(poolRef.current, hiddenIdsRef.current),
      min,
      max,
      feedbackMapRef.current,
      moveRef.current?.id
    );
  }

  async function hideCurrentSuggestion() {
    if (!moveRef.current) return;

    const current = moveRef.current;

    await addHiddenSuggestion({
      id: current.id,
      title: current.title,
      hiddenAt: new Date().toISOString(),
    });

    hiddenIdsRef.current.add(current.id);
    poolRef.current = filterHiddenMoves(poolRef.current, hiddenIdsRef.current);
    queueRef.current = filterHiddenMoves(queueRef.current, hiddenIdsRef.current);

    showNextMove();
  }

  useEffect(() => {
    hasLoadedRef.current = false;
  }, [min, max, preferences]);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    async function load() {
      setLoadMessage("Trying to find a move that actually sounds worth doing.");

      const hidden = await getHiddenSuggestions();
      hiddenIdsRef.current = new Set(hidden.map((h) => h.id));

      const feedback = await getSuggestionFeedback();
      feedbackMapRef.current = getFeedbackMap(feedback);

      const fallbackArea = "near you";
      const fallbackWeather: "sunny" = "sunny";
      const basicFallbackPool = makeFallbackSuggestions(fallbackArea);

      try {
        const fastSuggestions = await buildEngineSuggestions({
          minMinutes: min,
          maxMinutes: max,
          weather: fallbackWeather,
          timeOfDay: getTimeOfDay(),
          area: fallbackArea,
          preferences,
        });

        const mergedFastPool = [
          ...fastSuggestions,
          ...basicFallbackPool.filter(
            (fallback) => !fastSuggestions.some((s) => s.id === fallback.id)
          ),
        ];

        const fastPool = filterHiddenMoves(
          mergedFastPool,
          hiddenIdsRef.current
        );

        poolRef.current = fastPool;
        queueRef.current = buildQueue(
          fastPool,
          min,
          max,
          feedbackMapRef.current
        );

        const first = queueRef.current.shift() ?? null;
        if (first) setMove(first);
      } catch {
        const fastPool = filterHiddenMoves(
          basicFallbackPool,
          hiddenIdsRef.current
        );
        poolRef.current = fastPool;
        queueRef.current = buildQueue(
          fastPool,
          min,
          max,
          feedbackMapRef.current
        );
        const first = queueRef.current.shift() ?? null;
        if (first) setMove(first);
      }

      try {
        const location = await getReadableLocation();
        let nextWeather: "sunny" | "rain" | "fog" | "snow" = "sunny";

        if (location.lat && location.lon) {
          nextWeather = await getWeatherType(location.lat, location.lon);
        }

        const realArea = location.place || "near you";

        const realSuggestions = await buildEngineSuggestions({
          minMinutes: min,
          maxMinutes: max,
          weather: nextWeather,
          timeOfDay: getTimeOfDay(),
          area: realArea,
          preferences,
          lat: location.lat ?? undefined,
          lng: location.lon ?? undefined,
        });

        const mergedRealPool = [
          ...realSuggestions,
          ...makeFallbackSuggestions(realArea).filter(
            (fallback) => !realSuggestions.some((s) => s.id === fallback.id)
          ),
        ];

        const fullPool = filterHiddenMoves(
          mergedRealPool,
          hiddenIdsRef.current
        );

        poolRef.current = fullPool;
        queueRef.current = buildQueue(
          fullPool,
          min,
          max,
          feedbackMapRef.current,
          moveRef.current?.id
        );

        if (!moveRef.current) {
          const first = queueRef.current.shift() ?? null;
          if (first) setMove(first);
        }

        setArea(realArea);
        setWeather(nextWeather);
      } catch {
        setLoadMessage("Try another time range or check your internet.");
      }
    }

    load();
  }, [min, max, preferences]);

  const title = move?.title ?? "";
  const subtitle = move?.subtitle ?? null;
  const reason = move?.reason ?? "";
  const vibeLabel = move ? getVibeLabel(move) : "";
  const headerTitle = getTimeLabel(weather);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const quickAction = useMemo(() => {
    if (!move) return null;

    if (move.type === "place" && move.externalUrl) {
      return {
        label: "Open ticket page",
        url: move.externalUrl,
      };
    }

    if (move.type === "place") {
      return {
        label: "Open in Maps",
        url: `http://maps.apple.com/?q=${encodeURIComponent(move.mapQuery)}`,
      };
    }

    return getQuickActionForMove(title);
  }, [move, title]);

  if (!move) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.loadingTitle}>Looking for something better...</Text>
        <Text style={styles.loadingSub}>{loadMessage}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 48 }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <Text style={styles.headerSub}>
            {min >= 60 ? "1 hr+" : `${min}–${max} min`}
          </Text>
        </View>

        <View style={styles.counterPill}>
          <Text style={styles.counterNumber}>{passedCount}</Text>
          <Text style={styles.counterLabel}>passed</Text>
        </View>
      </View>

      <View style={styles.contextRow}>
        <Text style={styles.contextText}>{area}</Text>
      </View>

      <View style={styles.cardArea}>
        <Animated.View style={[styles.card, { opacity }]}>
          <View style={styles.topRow}>
            <View style={styles.vibePill}>
              <Text style={styles.vibeText}>{vibeLabel}</Text>
            </View>

            <Pressable style={styles.infoBtn} onPress={() => setInfoOpen(true)}>
              <Text style={styles.infoBtnText}>i</Text>
            </Pressable>
          </View>

          <Text style={styles.moveTitle}>{title}</Text>

          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{move.durationMinutes} min</Text>
            {move.type === "place" ? (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaText}>{move.distanceText}</Text>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaText}>{move.priceText}</Text>
                {move.hoursSummary ? (
                  <>
                    <Text style={styles.metaDot}>·</Text>
                    <Text style={styles.metaText} numberOfLines={2}>
                      {move.hoursSummary}
                    </Text>
                  </>
                ) : null}
              </>
            ) : null}
          </View>

          <Text style={styles.reasonText}>{reason}</Text>

          <View style={styles.feedbackRow}>
            <Pressable
              style={[
                styles.reactionButton,
                feedbackState === "liked" && styles.reactionButtonActive,
              ]}
              onPress={() => saveFeedback("liked")}
            >
              <Text style={styles.reactionIcon}>👍</Text>
            </Pressable>

            <Pressable
              style={[
                styles.reactionButton,
                feedbackState === "disliked" && styles.reactionButtonActive,
              ]}
              onPress={() => saveFeedback("disliked")}
            >
              <Text style={styles.reactionIcon}>👎</Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.startButton}
            onPress={() =>
              router.push({
                pathname: "/active-move",
                params: {
                  move: title,
                  moveId: move.id,
                  category: move.category,
                  durationMinutes: String(move.durationMinutes),
                  isPlace: move.type === "place" ? "true" : "false",
                  placeTitle: move.type === "place" ? move.title : "",
                  placeSubtitle: move.type === "place" ? move.subtitle ?? "" : "",
                  placeAddress: move.type === "place" ? move.address : "",
                  placeMapQuery: move.type === "place" ? move.mapQuery : "",
                  placeReason: move.type === "place" ? move.reason : "",
                  placePrice: move.type === "place" ? move.priceText : "",
                },
              })
            }
          >
            <Text style={styles.startButtonText}>Do this</Text>
          </Pressable>

          {quickAction && (
            <Pressable
              style={styles.mapButton}
              onPress={() => openQuickAction(quickAction.url)}
            >
              <Text style={styles.mapButtonText}>{quickAction.label}</Text>
            </Pressable>
          )}

          <Pressable
            style={styles.hideTextButton}
            onPress={hideCurrentSuggestion}
          >
            <Text style={styles.hideTextButtonText}>Don’t show this again</Text>
          </Pressable>

          <Pressable style={styles.nextButton} onPress={showNextMove}>
            <Text style={styles.nextButtonText}>Another idea</Text>
          </Pressable>
        </Animated.View>
      </View>

      <Modal
        visible={infoOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setInfoOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setInfoOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHandle} />

            <Text style={styles.modalTitle}>{title}</Text>
            {subtitle ? (
              <Text style={styles.modalSubtitle}>{subtitle}</Text>
            ) : null}

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Time</Text>
              <Text style={styles.infoValue}>{move.durationMinutes} min</Text>
            </View>

            {move.type === "place" ? (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Distance</Text>
                  <Text style={styles.infoValue}>{move.distanceText}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Price</Text>
                  <Text style={styles.infoValue}>{move.priceText}</Text>
                </View>

                {move.dateText ? (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Date</Text>
                    <Text style={styles.infoValue}>{move.dateText}</Text>
                  </View>
                ) : null}

                {move.startTimeText ? (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Start time</Text>
                    <Text style={styles.infoValue}>{move.startTimeText}</Text>
                  </View>
                ) : null}

                {move.hoursSummary ? (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Hours</Text>
                    <Text style={styles.infoValue}>{move.hoursSummary}</Text>
                  </View>
                ) : null}

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Reservation</Text>
                  <Text style={styles.infoValue}>
                    {move.reservationNeeded ? "Usually yes" : "Usually no"}
                  </Text>
                </View>

                {move.reservationNote ? (
                  <Text style={styles.infoNote}>{move.reservationNote}</Text>
                ) : null}

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Address</Text>
                  <Text style={styles.infoValueAddress}>{move.address}</Text>
                </View>
              </>
            ) : null}

            <View style={styles.whyBox}>
              <Text style={styles.whyTitle}>Why this fits</Text>
              <Text style={styles.whyText}>{reason}</Text>
            </View>

            {quickAction && (
              <Pressable
                style={styles.modalButton}
                onPress={() => openQuickAction(quickAction.url)}
              >
                <Text style={styles.modalButtonText}>{quickAction.label}</Text>
              </Pressable>
            )}

            <Pressable
              style={styles.modalSecondaryButton}
              onPress={() => setInfoOpen(false)}
            >
              <Text style={styles.modalSecondaryButtonText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof getColors>) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
  },

  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: colors.bg,
  },

  loadingTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: -0.2,
  },

  loadingSub: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  backBtn: {
    width: 42,
    height: 42,
    backgroundColor: colors.bgCard,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },

  backArrow: {
    fontSize: 20,
    color: colors.text,
    fontWeight: "600",
  },

  headerCenter: {
    flex: 1,
    paddingHorizontal: 14,
  },

  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },

  headerSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },

  counterPill: {
    minWidth: 54,
    alignItems: "center",
    backgroundColor: colors.bgCard,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },

  counterNumber: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    lineHeight: 18,
  },

  counterLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: "600",
    letterSpacing: 0,
    marginTop: 1,
  },

  contextRow: {
    marginBottom: 14,
  },

  contextText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: "600",
  },

  cardArea: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: 8,
  },

  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
  },

  vibePill: {
    backgroundColor: colors.bgCardSoft,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },

  vibeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    letterSpacing: 0,
  },

  infoBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.bgCardSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  infoBtnText: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },

  moveTitle: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 36,
    letterSpacing: -0.3,
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 17,
    color: colors.textMuted,
    lineHeight: 24,
    marginBottom: 14,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 18,
  },

  metaText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: "700",
  },

  metaDot: {
    marginHorizontal: 8,
    color: colors.textMuted,
  },

  reasonText: {
    fontSize: 16,
    color: colors.textSub,
    lineHeight: 25,
    marginBottom: 18,
  },

  feedbackRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },

  reactionButton: {
    width: 46,
    height: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.bgCardSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  reactionButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },

  reactionIcon: {
    fontSize: 20,
  },

  startButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  startButtonText: {
    color: colors.textInverse,
    fontSize: 17,
    fontWeight: "700",
  },

  mapButton: {
    backgroundColor: colors.bgCardSoft,
    borderRadius: radius.md,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },

  mapButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },

  hideTextButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    marginTop: 2,
    marginBottom: 4,
  },

  hideTextButtonText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },

  nextButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },

  nextButtonText: {
    color: colors.textMuted,
    fontSize: 17,
    fontWeight: "700",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },

  modalCard: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: colors.border,
  },

  modalHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
    marginBottom: 16,
  },

  modalTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 6,
    letterSpacing: -0.2,
  },

  modalSubtitle: {
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 16,
    lineHeight: 22,
  },

  infoRow: {
    marginBottom: 12,
  },

  infoLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
    letterSpacing: 0,
    marginBottom: 4,
  },

  infoValue: {
    fontSize: 16,
    color: colors.text,
    fontWeight: "600",
  },

  infoValueAddress: {
    fontSize: 14,
    color: colors.text,
    fontWeight: "600",
    lineHeight: 20,
  },

  infoNote: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 12,
  },

  whyBox: {
    backgroundColor: colors.bgCardSoft,
    borderRadius: radius.md,
    padding: 14,
    marginTop: 6,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },

  whyTitle: {
    fontSize: 14,
    color: colors.text,
    fontWeight: "700",
    marginBottom: 6,
  },

  whyText: {
    fontSize: 14,
    color: colors.textSub,
    lineHeight: 20,
  },

  modalButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 10,
  },

  modalButtonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: "700",
  },

  modalSecondaryButton: {
    backgroundColor: colors.bgCardSoft,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },

  modalSecondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  });
}