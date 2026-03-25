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
        style={[
          styles.circleBtn,
          { borderColor: colors.textMuted + "55", backgroundColor: "transparent" },
        ]}
        onPress={onNah}
        hitSlop={10}
      >
        <Text style={[styles.circleGlyph, { color: colors.text }]}>✕</Text>
      </Pressable>
      <Pressable
        style={[
          styles.circleBtn,
          { borderColor: colors.accent + "55", backgroundColor: colors.accent + "18" },
        ]}
        onPress={onGo}
        hitSlop={10}
      >
        <Text style={[styles.circleGlyph, { color: colors.accent }]}>✓</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  cardSlot: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  labelOverlay: {
    position: "absolute",
    top: "38%",
    zIndex: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 3,
  },
  labelGo: {
    right: spacing.md,
    borderColor: "rgba(74, 222, 128, 0.95)",
    backgroundColor: "rgba(22, 101, 52, 0.35)",
  },
  labelNah: {
    left: spacing.md,
    borderColor: "rgba(248, 113, 113, 0.95)",
    backgroundColor: "rgba(127, 29, 29, 0.35)",
  },
  labelText: {
    fontSize: font.sizeMd,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  btnRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 36,
    marginTop: spacing.md,
  },
  circleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  circleGlyph: {
    fontSize: 20,
    fontWeight: "800",
  },
});
