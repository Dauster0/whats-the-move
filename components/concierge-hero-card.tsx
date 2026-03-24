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
};

export function ConciergeHeroCard({ suggestion: s, width, colors, onOpenMaps, onOpenTickets }: Props) {
  const pad = spacing.md;
  const innerW = width - pad * 2;
  const mediaHeight = Math.round(innerW * 0.82);
  const fallbackBg = categoryFallbackBackground(s.category);
  const poster = s.imageLayout === "poster";
  const ticketed = Boolean((s.ticketUrl || "").trim());
  const venue = (s.venueName || "").trim();

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
        <View style={[styles.media, { height: mediaHeight, backgroundColor: fallbackBg }]}>
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
            colors={["transparent", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.94)"]}
            locations={[0.28, 0.62, 1]}
            style={styles.scrim}
          />

          {s.whyNow ? (
            <View style={[styles.whyBadge, { borderLeftColor: colors.accent }]}>
              <Text style={styles.whyBadgeLabel}>Why now</Text>
              <Text style={styles.whyBadgeText} numberOfLines={2}>
                {s.whyNow}
              </Text>
            </View>
          ) : null}

          <View style={styles.copyBlock}>
            <Text style={styles.category}>{s.category}</Text>
            <Text style={styles.title} numberOfLines={ticketed && venue ? 3 : 2}>
              {s.title}
            </Text>
            {ticketed && venue ? (
              <Text style={styles.venue} numberOfLines={2}>
                {venue}
              </Text>
            ) : null}
            <Text style={styles.description} numberOfLines={2}>
              {s.description}
            </Text>
            <View style={styles.tagRow}>
              {s.timeRequired ? <Text style={styles.tag}>{s.timeRequired}</Text> : null}
              <Text style={styles.tag}>{s.energyLevel}</Text>
              {s.startTime ? <Text style={styles.tag}>{s.startTime}</Text> : null}
            </View>

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
                  style={[styles.secondaryBtn, { borderColor: "rgba(255,255,255,0.45)" }]}
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
  media: {
    width: "100%",
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
    height: "86%",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
  },
  whyBadge: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    maxWidth: "90%",
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
  },
  whyBadgeLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  whyBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
    lineHeight: 18,
  },
  copyBlock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  category: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.62)",
    textTransform: "lowercase",
    marginBottom: 4,
  },
  title: {
    fontSize: font.sizeXl,
    lineHeight: 34,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  venue: {
    marginTop: 4,
    fontSize: font.sizeSm,
    fontWeight: "600",
    color: "rgba(255,255,255,0.78)",
  },
  description: {
    marginTop: 10,
    fontSize: font.sizeMd,
    lineHeight: 22,
    fontWeight: "500",
    color: "rgba(255,255,255,0.9)",
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
    color: "rgba(255,255,255,0.85)",
    backgroundColor: "rgba(255,255,255,0.12)",
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
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "rgba(255,255,255,0.95)",
  },
});
