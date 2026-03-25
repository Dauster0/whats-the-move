import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { ConciergeSuggestion } from "../lib/concierge-types";
import { colorsLight, font, radius, spacing } from "../lib/theme";

type ThemeColors = typeof colorsLight;

/** Photo strip height (fixed). Text panel grows below — never clip CTAs with a short flex slot. */
const IMAGE_ZONE_RATIO = 0.46;

/** Use on horizontal `ScrollView` so the row is tall enough for the full card (image + text + CTAs). */
export function getConciergeCardMinHeight(width: number) {
  const pad = spacing.md;
  const innerW = width - pad * 2;
  const imageZoneH = Math.max(168, Math.round(innerW * IMAGE_ZONE_RATIO));
  return imageZoneH + 400;
}

function categoryFallbackBackground(category: string) {
  const c = String(category || "").toLowerCase();
  if (/eat|food|restaurant|coffee|cafe|bakery|bar|drink/.test(c)) return "#3d2918";
  if (/event|social|live|concert|comedy|theater|theatre|show|night/.test(c)) return "#0d1526";
  if (/walk|park|trail|outdoor|hike|nature|scenic|experience/.test(c)) return "#14261c";
  if (/chill|relax|spa|wellness/.test(c)) return "#222228";
  return "#1a1a20";
}

function ShimmerOverlay({ style }: { style: StyleProp<ViewStyle> }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [x]);
  const translateX = x.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 280],
  });
  return (
    <View style={[style, { overflow: "hidden", backgroundColor: "rgba(0,0,0,0.35)" }]}>
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 90,
          backgroundColor: "rgba(255,255,255,0.14)",
          transform: [{ translateX }, { skewX: "-12deg" }],
        }}
      />
    </View>
  );
}

type Props = {
  suggestion: ConciergeSuggestion;
  width: number;
  colors: ThemeColors;
  onOpenMaps: (s: ConciergeSuggestion) => void;
  onOpenTickets: (s: ConciergeSuggestion) => void;
  /** Opens full detail sheet (card tap, not the map/ticket buttons). */
  onCardPress?: () => void;
};

export function ConciergeHeroCard({
  suggestion: s,
  width,
  colors,
  onOpenMaps,
  onOpenTickets,
  onCardPress,
}: Props) {
  const pad = spacing.md;
  const innerW = width - pad * 2;
  const imageZoneH = Math.max(168, Math.round(innerW * IMAGE_ZONE_RATIO));
  const fallbackBg = categoryFallbackBackground(s.category);
  const poster = s.imageLayout === "poster";
  const ticketed = Boolean((s.ticketUrl || "").trim());
  const venue = (s.venueName || "").trim();
  const why = (s.whyNow || "").trim();

  const [imgLoaded, setImgLoaded] = useState(!s.photoUrl);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgLoaded(!s.photoUrl);
    setImgError(false);
  }, [s.photoUrl, s.title]);

  const showRemote = Boolean(s.photoUrl) && !imgError;
  const showShimmer = Boolean(s.photoUrl) && !imgLoaded && !imgError;

  return (
    <View style={{ width, paddingHorizontal: pad, marginBottom: spacing.sm }}>
      <View
        style={[
          styles.frame,
          {
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
          },
        ]}
      >
        <View style={styles.column}>
          <Pressable
            disabled={!onCardPress}
            onPress={onCardPress}
            style={({ pressed }) => [pressed && onCardPress ? { opacity: 0.98 } : null]}
          >
            <View style={[styles.imageZone, { height: imageZoneH, backgroundColor: fallbackBg }]}>
            {showShimmer ? <ShimmerOverlay style={StyleSheet.absoluteFill} /> : null}

            {showRemote ? (
              poster ? (
                <View style={styles.posterStage}>
                  <Image
                    source={{ uri: s.photoUrl! }}
                    style={styles.posterImage}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    recyclingKey={s.photoUrl ?? undefined}
                    onLoad={() => setImgLoaded(true)}
                    onError={() => {
                      setImgError(true);
                      setImgLoaded(true);
                    }}
                  />
                </View>
              ) : (
                <Image
                  source={{ uri: s.photoUrl! }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={s.photoUrl ?? undefined}
                  onLoad={() => setImgLoaded(true)}
                  onError={() => {
                    setImgError(true);
                    setImgLoaded(true);
                  }}
                />
              )
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackBg }]} />
            )}

            <LinearGradient
              pointerEvents="none"
              colors={["transparent", "rgba(0,0,0,0.55)"]}
              style={styles.imageBottomFade}
            />
            </View>

            <View style={styles.textBody}>
            {why ? (
              <View style={[styles.whyBlock, { borderLeftColor: colors.accent }]}>
                <Text style={styles.whyLabel}>Why now</Text>
                <Text style={styles.whyBody} numberOfLines={3}>
                  {why}
                </Text>
              </View>
            ) : null}

            <Text style={styles.category}>{s.category}</Text>
            <Text style={styles.title} numberOfLines={3}>
              {s.title}
            </Text>
            {ticketed && venue ? (
              <Text style={styles.venue} numberOfLines={2}>
                {venue}
              </Text>
            ) : null}
            <Text style={styles.description} numberOfLines={4}>
              {s.description}
            </Text>

            <View style={styles.tagRow}>
              {s.timeRequired ? <Text style={styles.tag}>{s.timeRequired}</Text> : null}
              <Text style={styles.tag}>{s.energyLevel}</Text>
              {s.startTime ? <Text style={styles.tag}>{s.startTime}</Text> : null}
            </View>
            </View>
          </Pressable>

          <View style={styles.textPanelFooter}>
            {ticketed ? (
              <View style={styles.ctaRow}>
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onOpenTickets(s);
                  }}
                >
                  <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>Tickets</Text>
                  <Ionicons name="open-outline" size={18} color={colors.textInverse} />
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, { borderColor: "rgba(255,255,255,0.35)" }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onOpenMaps(s);
                  }}
                >
                  <Text style={styles.secondaryBtnText}>Directions</Text>
                  <Ionicons name="map-outline" size={17} color="rgba(255,255,255,0.92)" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[styles.primaryBtn, styles.primaryBtnSolo, { backgroundColor: colors.accent }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onOpenMaps(s);
                }}
              >
                <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>Get directions</Text>
                <Ionicons name="map-outline" size={18} color={colors.textInverse} />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
  },
  column: {
    flexDirection: "column",
    width: "100%",
    flexShrink: 0,
  },
  imageZone: {
    width: "100%",
    overflow: "hidden",
    position: "relative",
  },
  posterStage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#070708",
    alignItems: "center",
    justifyContent: "center",
  },
  posterImage: {
    width: "92%",
    height: "88%",
  },
  imageBottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 36,
  },
  textBody: {
    backgroundColor: "#161412",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 2,
    borderTopColor: "rgba(255,255,255,0.14)",
  },
  textPanelFooter: {
    backgroundColor: "#161412",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: 4,
  },
  whyBlock: {
    marginBottom: spacing.sm,
    paddingLeft: 10,
    paddingVertical: 8,
    paddingRight: 8,
    borderLeftWidth: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: radius.sm,
  },
  whyLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 0.8,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  whyBody: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
  },
  category: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.55)",
    textTransform: "lowercase",
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.2,
  },
  venue: {
    marginTop: 6,
    fontSize: font.sizeSm,
    fontWeight: "600",
    color: "rgba(255,255,255,0.75)",
  },
  description: {
    marginTop: 10,
    fontSize: font.sizeMd,
    lineHeight: 22,
    fontWeight: "500",
    color: "rgba(255,255,255,0.88)",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    marginBottom: 14,
  },
  tag: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.88)",
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  ctaRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  primaryBtnSolo: {
    flex: 0,
    alignSelf: "stretch",
    paddingHorizontal: 22,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "rgba(255,255,255,0.95)",
  },
});
