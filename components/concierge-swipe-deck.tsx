import { useEffect } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import type { ConciergeSuggestion } from "../lib/concierge-types";
import { font, radius, spacing } from "../lib/theme";

const { width: SCREEN_W } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_W * 0.22;
const ROT_MAX = 10;

function stableKey(s: ConciergeSuggestion) {
  return `${s.title}|${s.mapQuery}|${s.ticketEventId || ""}|${s.movieTitle || ""}`;
}

type DeckColors = {
  accent: string;
  text: string;
  textMuted: string;
  textInverse: string;
};

type Props = {
  suggestions: ConciergeSuggestion[];
  width: number;
  height: number;
  colors: DeckColors;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  renderCard: (s: ConciergeSuggestion, ctx: { isTop: boolean }) => ReactNode;
};

export function ConciergeSwipeDeck({
  suggestions,
  width,
  height,
  colors,
  onSwipeRight,
  onSwipeLeft,
  renderCard,
}: Props) {
  const top = suggestions[0];
  const stack = suggestions.slice(0, 3);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateX.value = 0;
    translateY.value = 0;
  }, [top?.title, top?.mapQuery, top?.movieTitle]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.12;
    })
    .onEnd((e) => {
      const dx = translateX.value;
      const vx = e.velocityX;
      const goRight = dx > SWIPE_THRESHOLD || (vx > 800 && dx > 28);
      const goLeft = dx < -SWIPE_THRESHOLD || (vx < -800 && dx < -28);
      const exitDur = 168;
      const exitX = SCREEN_W * 1.45;
      const ease = Easing.out(Easing.cubic);
      if (goRight) {
        translateX.value = withTiming(exitX, { duration: exitDur, easing: ease }, (finished) => {
          if (finished) runOnJS(onSwipeRight)();
        });
      } else if (goLeft) {
        translateX.value = withTiming(-exitX, { duration: exitDur, easing: ease }, (finished) => {
          if (finished) runOnJS(onSwipeLeft)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
        translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      {
        rotate: `${interpolate(
          translateX.value,
          [-SCREEN_W * 0.5, 0, SCREEN_W * 0.5],
          [-ROT_MAX, 0, ROT_MAX],
          Extrapolation.CLAMP
        )}deg`,
      },
    ],
  }));

  const greenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD * 1.5], [0, 0.92], Extrapolation.CLAMP),
  }));

  const redStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD * 1.5, 0], [0.92, 0], Extrapolation.CLAMP),
  }));

  if (!top) {
    return <View style={{ width, height }} />;
  }

  return (
    <View style={[styles.wrap, { width, height }]}>
      {[2, 1, 0].map((depth) => {
        const s = stack[depth];
        if (!s) return null;
        const isTop = depth === 0;
        const z = 3 - depth;
        const scale = 1 - depth * 0.045;
        const translateYB = depth * 11;

        if (!isTop) {
          return (
            <View
              key={stableKey(s)}
              style={[
                styles.cardSlot,
                {
                  zIndex: z,
                  transform: [{ scale }, { translateY: translateYB }],
                },
              ]}
            >
              {renderCard(s, { isTop: false })}
            </View>
          );
        }

        return (
          <GestureDetector key={stableKey(s)} gesture={pan}>
            <Animated.View style={[styles.cardSlot, { zIndex: 10 }, cardStyle]}>
              <Animated.View
                pointerEvents="none"
                style={[styles.labelOverlay, styles.labelGo, greenStyle]}
              >
                <Text style={[styles.labelText, { color: colors.textInverse }]}>Let’s go</Text>
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={[styles.labelOverlay, styles.labelNah, redStyle]}
              >
                <Text style={[styles.labelText, { color: colors.textInverse }]}>Nah</Text>
              </Animated.View>
              {renderCard(s, { isTop: true })}
            </Animated.View>
          </GestureDetector>
        );
      })}
    </View>
  );
}

export function DeckButtons({
  onNah,
  onGo,
  colors,
}: {
  onNah: () => void;
  onGo: () => void;
  colors: DeckColors;
}) {
  return (
    <View style={styles.btnRow}>
      <Pressable
        style={styles.nahBtn}
        onPress={onNah}
        hitSlop={12}
      >
        <Text style={styles.nahLabel}>Nah</Text>
      </Pressable>
      <Pressable
        style={[styles.goBtn, { backgroundColor: colors.accent }]}
        onPress={onGo}
        hitSlop={12}
      >
        <Text style={[styles.goLabel, { color: "#1C1916" }]}>I'm going</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "hidden",
  },
  /** Top-aligned so tall cards aren’t clipped from above (hero image stays visible). */
  cardSlot: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    alignItems: "center",
  },
  labelOverlay: {
    position: "absolute",
    top: "36%",
    zIndex: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 2.5,
  },
  labelGo: {
    right: spacing.sm,
    borderColor: "rgba(74, 222, 128, 0.9)",
    backgroundColor: "rgba(22, 101, 52, 0.45)",
  },
  labelNah: {
    left: spacing.sm,
    borderColor: "rgba(248, 113, 113, 0.9)",
    backgroundColor: "rgba(127, 29, 29, 0.45)",
  },
  labelText: {
    fontSize: font.sizeMd,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  nahBtn: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2a2a2a",
  },
  nahLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  goBtn: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  goLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
});
