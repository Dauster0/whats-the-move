import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { addHiddenSuggestion } from "../lib/hidden-suggestions-storage";
import { addStoredPersonalPlace } from "../lib/personal-place-storage";
import { colors, font, radius, spacing } from "../lib/theme";
import { useMoveStore } from "../store/move-context";

type MoveCategory = "micro" | "short" | "social";

const CATEGORY_EMOJI: Record<MoveCategory, string> = {
  micro: "⚡",
  short: "🌍",
  social: "👥",
};

export default function ActiveMoveScreen() {
  const {
    move,
    moveId,
    category,
    durationMinutes,
    isPlace,
    placeTitle,
    placeSubtitle,
    placeAddress,
    placeMapQuery,
    placeReason,
    placePrice,
  } = useLocalSearchParams<{
    move?: string;
    moveId?: string;
    category?: string;
    durationMinutes?: string;
    isPlace?: string;
    placeTitle?: string;
    placeSubtitle?: string;
    placeAddress?: string;
    placeMapQuery?: string;
    placeReason?: string;
    placePrice?: string;
  }>();

  const safeMove = typeof move === "string" ? move : "Go do the move.";
  const safeMoveId = typeof moveId === "string" ? moveId : `move-${safeMove}`;
  const safeCategory: MoveCategory =
    category === "micro" || category === "short" || category === "social"
      ? category
      : "micro";
  const safeDurationMinutes = Number(durationMinutes) || 5;
  const isSavedPlaceCandidate = isPlace === "true";

  const { addCompletedMove } = useMoveStore();

  const [seconds, setSeconds] = useState(safeDurationMinutes * 60);
  const [elapsed, setElapsed] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hidden, setHidden] = useState(false);

  const hasLoggedRef = useRef(false);
  const totalSeconds = safeDurationMinutes * 60;

  function completeMove() {
    if (!hasLoggedRef.current) {
      addCompletedMove(safeMove, safeCategory, safeDurationMinutes);
      hasLoggedRef.current = true;
    }
    setCompleted(true);
  }

  async function savePlaceAfterCompletion() {
    if (!isSavedPlaceCandidate || saved) return;

    await addStoredPersonalPlace({
      id: `personal-${(placeTitle || safeMove)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}`,
      title: placeTitle || safeMove,
      subtitle: placeSubtitle || "A place worth coming back to",
      category: "short",
      durationMinutes: safeDurationMinutes,
      interests: ["solo-recharge"],
      vibes: ["solo", "social"],
      neighborhoods: ["usc", "los angeles"],
      weatherFit: ["any"],
      timeFit: ["morning", "midday", "afternoon", "evening", "night"],
      priceText:
        placePrice === "$" || placePrice === "$$" || placePrice === "$$$"
          ? placePrice
          : "$$",
      reservationNeeded: false,
      address: placeAddress || "Los Angeles, CA",
      mapQuery: placeMapQuery || placeTitle || safeMove,
      whyThisFits: placeReason || "You tried it and it was worth saving.",
      tags: ["favorite"],
      distanceTextByArea: {
        usc: "Saved place",
        "los angeles": "Saved place",
      },
    });

    setSaved(true);
  }

  async function hideSuggestionAfterCompletion() {
    if (hidden) return;

    await addHiddenSuggestion({
      id: safeMoveId,
      title: safeMove,
      hiddenAt: new Date().toISOString(),
    });

    setHidden(true);
  }

  useEffect(() => {
    if (completed) return;

    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setTimeout(() => completeMove(), 0);
          return 0;
        }
        return prev - 1;
      });
      setElapsed((e) => e + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [completed]);

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const progress = elapsed / totalSeconds;
  const progressPercent = Math.min(progress * 100, 100);

  if (completed) {
    return (
      <View style={styles.screen}>
        <View style={styles.completeCard}>
          <Text style={styles.completeEmoji}>✓</Text>
          <Text style={styles.completeTitle}>Nice.</Text>
          <Text style={styles.completeMove}>{safeMove}</Text>
          <Text style={styles.completeSub}>
            You chose something better than scrolling.
          </Text>

          {isSavedPlaceCandidate && !saved && (
            <Pressable style={styles.secondaryButton} onPress={savePlaceAfterCompletion}>
              <Text style={styles.secondaryButtonText}>Save this place</Text>
            </Pressable>
          )}

          {saved && (
            <View style={styles.savedPill}>
              <Text style={styles.savedPillText}>Saved to your places</Text>
            </View>
          )}

          {!hidden && (
            <Pressable style={styles.secondaryButton} onPress={hideSuggestionAfterCompletion}>
              <Text style={styles.secondaryButtonText}>Never suggest this again</Text>
            </Pressable>
          )}

          {hidden && (
            <View style={styles.savedPill}>
              <Text style={styles.savedPillText}>Hidden from future suggestions</Text>
            </View>
          )}

          <Pressable
            style={styles.doneButton}
            onPress={() => router.push("/weekly-report")}
          >
            <Text style={styles.doneButtonText}>Finish</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topSection}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>

        <View style={styles.categoryTag}>
          <Text style={styles.categoryEmoji}>{CATEGORY_EMOJI[safeCategory]}</Text>
          <Text style={styles.categoryText}>{safeCategory}</Text>
        </View>
      </View>

      <View style={styles.moveSection}>
        <Text style={styles.inProgressLabel}>In progress</Text>
        <Text style={styles.moveText}>{safeMove}</Text>
      </View>

      <View style={styles.timerSection}>
        <Text style={styles.timerText}>
          {minutes}:{remainingSeconds.toString().padStart(2, "0")}
        </Text>
        <Text style={styles.timerLabel}>remaining</Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` as const }]} />
        </View>
        <Text style={styles.progressLabel}>
          {Math.floor(progressPercent)}% done · {safeDurationMinutes} min total
        </Text>
      </View>

      <View style={styles.nudgeCard}>
        <Text style={styles.nudgeText}>
          {progressPercent < 30
            ? "You already broke the pattern."
            : progressPercent < 70
            ? "Keep going. This was a good call."
            : "Almost there."}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.doneActionButton} onPress={completeMove}>
          <Text style={styles.doneActionButtonText}>Done</Text>
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 60,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },

  topSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  backBtn: {
    width: 42,
    height: 42,
    backgroundColor: colors.bgCard,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  backArrow: {
    fontSize: font.sizeLg,
    color: colors.text,
    fontWeight: "600",
  },
  categoryTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgMuted,
    borderRadius: radius.full,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 6,
  },
  categoryEmoji: { fontSize: 14 },
  categoryText: {
    color: colors.textSub,
    fontSize: font.sizeXs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  moveSection: {
    marginBottom: spacing.xl,
  },
  inProgressLabel: {
    fontSize: font.sizeXs,
    color: colors.textMuted,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  moveText: {
    fontSize: font.sizeXxl,
    fontWeight: "800",
    color: colors.text,
    lineHeight: 44,
    letterSpacing: -1,
  },

  timerSection: {
    marginBottom: spacing.lg,
  },
  timerText: {
    fontSize: 80,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -4,
    lineHeight: 88,
    fontVariant: ["tabular-nums"],
  },
  timerLabel: {
    fontSize: font.sizeSm,
    color: colors.textMuted,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.bgMuted,
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.bgDark,
    borderRadius: 999,
  },
  progressLabel: {
    fontSize: font.sizeXs,
    color: colors.textMuted,
    fontWeight: "500",
  },

  nudgeCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  nudgeText: {
    fontSize: font.sizeMd,
    color: colors.textSub,
    fontWeight: "500",
    lineHeight: 22,
  },

  actions: {
    gap: 10,
    marginTop: "auto",
  },
  doneActionButton: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: "center",
  },
  doneActionButtonText: {
    color: colors.textInverse,
    fontSize: font.sizeMd,
    fontWeight: "700",
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelButtonText: {
    color: colors.textMuted,
    fontSize: font.sizeMd,
    fontWeight: "600",
  },

  completeCard: {
    marginTop: "auto",
    marginBottom: "auto",
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  completeEmoji: {
    fontSize: 40,
    marginBottom: 10,
    color: colors.text,
  },
  completeTitle: {
    fontSize: font.sizeXl,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 6,
  },
  completeMove: {
    fontSize: font.sizeLg,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    marginBottom: 10,
  },
  completeSub: {
    fontSize: font.sizeMd,
    color: colors.textSub,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 18,
  },
  secondaryButton: {
    backgroundColor: colors.bgCardSoft,
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    alignSelf: "stretch",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: font.sizeMd,
    fontWeight: "700",
  },
  savedPill: {
    backgroundColor: colors.bgMuted,
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  savedPillText: {
    color: colors.text,
    fontSize: font.sizeSm,
    fontWeight: "700",
  },
  doneButton: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignSelf: "stretch",
    alignItems: "center",
  },
  doneButtonText: {
    color: colors.textInverse,
    fontSize: font.sizeMd,
    fontWeight: "700",
  },
});