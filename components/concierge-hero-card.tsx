import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import * as Linking from "expo-linking";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { ConciergeSuggestion } from "../lib/concierge-types";
import { truncateEventTitle, truncateToTwoSentences } from "../lib/truncate-card-copy";
import { colorsLight, font, radius, spacing } from "../lib/theme";

type ThemeColors = typeof colorsLight;

/** Non-swipe: photo strip vs width. Swipe deck: image capped at 45% of card height (see imageZoneH). */
const IMAGE_ZONE_RATIO = 0.46;

/** Use when a horizontal list needs a min row height for a full hero card. */
export function getConciergeCardMinHeight(width: number) {
  const pad = spacing.md;
  const innerW = width - pad * 2;
  const imageZoneH = Math.max(168, Math.round(innerW * IMAGE_ZONE_RATIO));
  return imageZoneH + 320;
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
  /** Swipe deck: hide map/ticket footer — detail is one swipe away. */
  swipeMode?: boolean;
  /** When set with swipeMode, image stays fixed and text scrolls inside the deck. */
  deckMaxHeight?: number;
  /** Bottom of image fade — match card panel (e.g. theme bgCard). */
  imageGradientBottomColor?: string;
  onBookmarkPress?: () => void;
  bookmarkSaved?: boolean;
};

export function ConciergeHeroCard({
  suggestion: s,
  width,
  colors,
  onOpenMaps,
  onOpenTickets,
  onCardPress,
  swipeMode,
  deckMaxHeight,
  imageGradientBottomColor = "#161412",
  onBookmarkPress,
  bookmarkSaved,
}: Props) {
  const pad = spacing.md;
  const innerW = width - pad * 2;
  const imageZoneH =
    swipeMode && deckMaxHeight != null && deckMaxHeight > 0
      ? Math.max(112, Math.round(deckMaxHeight * 0.38))
      : Math.max(168, Math.round(innerW * IMAGE_ZONE_RATIO));
  const fallbackBg = categoryFallbackBackground(s.category);
  const poster = s.imageLayout === "poster";
  const isMovie = s.kind === "movie" || Boolean(s.showtimes?.length || s.tmdbId);
  const ticketed = Boolean((s.ticketUrl || "").trim());
  const venue = (s.venueName || "").trim();
  const why = (s.whyNow || "").trim();
  const rawTitle = (isMovie && s.movieTitle ? s.movieTitle : s.title) || s.title;
  const displayTitle = truncateEventTitle(rawTitle);
  const subLine = (s.theaterSubtitle || "").trim() || (ticketed && venue ? venue : "");

  const [imgLoaded, setImgLoaded] = useState(!s.photoUrl);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgLoaded(!s.photoUrl);
    setImgError(false);
  }, [s.photoUrl, s.title]);

  const showRemote = Boolean(s.photoUrl) && !imgError;
  const showShimmer = Boolean(s.photoUrl) && !imgLoaded && !imgError;

  const displayDescription = swipeMode ? truncateToTwoSentences(s.description) : s.description;

  const deckFit = Boolean(swipeMode && deckMaxHeight != null && deckMaxHeight > 0);

  const imageBlock = (
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
            contentPosition="top"
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
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.12)", imageGradientBottomColor]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      {swipeMode ? (
        <View style={styles.imageCategoryRow} pointerEvents="none">
          {s.dateBadge ? (
            <View style={styles.dateBadgePill}>
              <Text style={styles.dateBadgeText}>{s.dateBadge}</Text>
            </View>
          ) : null}
          {s.closesSoon ? (
            <View style={styles.closesSoonPill}>
              <Text style={styles.closesSoonText}>Closes soon</Text>
            </View>
          ) : null}
          <Text style={styles.imageCategory}>{s.category}</Text>
        </View>
      ) : null}
    </View>
  );

  const textBodyInner = (
    <>
      {why && !swipeMode ? (
        <View style={[styles.whyBlock, { borderLeftColor: colors.accent }]}>
          <Text style={styles.whyLabel}>Why now</Text>
          <Text style={styles.whyBody} numberOfLines={3}>
            {why}
          </Text>
        </View>
      ) : null}

      {!swipeMode ? <Text style={styles.category}>{s.category}</Text> : null}
      <Text style={styles.title} numberOfLines={swipeMode ? 2 : 3}>
        {displayTitle}
      </Text>
      {subLine ? (
        <Text style={styles.venue} numberOfLines={swipeMode ? 1 : 2}>
          {subLine}
        </Text>
      ) : null}
      <Text
        style={[styles.description, swipeMode && styles.descriptionSwipe]}
        numberOfLines={swipeMode ? 4 : isMovie ? 5 : 4}
      >
        {displayDescription}
      </Text>

      {(s.distanceText || s.cost || s.openUntil) ? (
        <Text style={[styles.metaLine, { marginTop: 6 }]} numberOfLines={2}>
          {[s.distanceText, s.cost, s.openUntil]
            .filter((v) => v && !/^varies$/i.test(String(v).trim()))
            .join(" · ")}
        </Text>
      ) : null}

      {isMovie &&
      (s.tmdbRating != null ||
        s.runtimeMinutes != null ||
        (s.movieGenres && s.movieGenres.length)) ? (
        <Text style={styles.metaLine} numberOfLines={2}>
          {s.tmdbRating != null ? `TMDB ${s.tmdbRating.toFixed(1)}` : ""}
          {s.tmdbRating != null && s.runtimeMinutes != null ? " · " : ""}
          {s.runtimeMinutes != null ? `${s.runtimeMinutes} min` : ""}
          {s.movieGenres && s.movieGenres.length
            ? ` · ${s.movieGenres.slice(0, 3).join(" · ")}`
            : ""}
        </Text>
      ) : null}

      {isMovie && s.showtimes && s.showtimes.length > 0 ? (
        <View style={styles.showtimeRow}>
          {s.showtimes.slice(0, 6).map((p, i) => (
            <Pressable
              key={`${p.label}-${i}`}
              style={[styles.showtimeChip, { borderColor: colors.accent + "66" }]}
              onPress={() => {
                Haptics.selectionAsync();
                const u = (p.bookingUrl || "").trim() || (s.ticketUrl || "").trim();
                if (u) Linking.openURL(u).catch(() => {});
              }}
            >
              <Text style={[styles.showtimeChipText, { color: colors.accent }]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.tagRow}>
        {s.timeRequired ? <Text style={styles.tag}>{s.timeRequired}</Text> : null}
        <Text style={styles.tag}>{s.energyLevel}</Text>
        {s.startTime ? <Text style={styles.tag}>{s.startTime}</Text> : null}
      </View>
    </>
  );

  const footerBlock = (
    <View style={[styles.textPanelFooter, swipeMode && styles.textPanelFooterSwipe]}>
      {swipeMode ? null : ticketed ? (
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
      {swipeMode && isMovie && s.showtimes?.length ? (
        <Text style={styles.swipeHintFooter}>Tap a time to book · tap card for details · swipe right if you’re going</Text>
      ) : null}
    </View>
  );

  const cardPressProps = {
    disabled: !onCardPress,
    onPress: onCardPress,
  } as const;

  return (
    <View style={{ width, paddingHorizontal: pad, marginBottom: swipeMode ? 0 : spacing.sm }}>
      <View
        style={[
          styles.frame,
          swipeMode && styles.frameSwipe,
          deckFit ? { height: deckMaxHeight, maxHeight: deckMaxHeight } : null,
          {
            borderColor: swipeMode ? "rgba(255,255,255,0.1)" : colors.border,
            backgroundColor: colors.bgCard,
          },
        ]}
      >
        <View style={[styles.column, deckFit && styles.columnDeckFit]}>
          {onBookmarkPress ? (
            <Pressable
              style={[styles.bookmarkHit, { backgroundColor: "rgba(0,0,0,0.45)" }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onBookmarkPress();
              }}
              hitSlop={12}
            >
              <Ionicons
                name={bookmarkSaved ? "bookmark" : "bookmark-outline"}
                size={22}
                color="#fff"
              />
            </Pressable>
          ) : null}
          {deckFit ? (
            <View style={styles.swipeDeckBody}>
              <Pressable
                {...cardPressProps}
                style={({ pressed }) => [
                  pressed && onCardPress ? { opacity: 0.98 } : null,
                ]}
              >
                {imageBlock}
              </Pressable>
              <ScrollView
                style={styles.swipeTextScroll}
                contentContainerStyle={styles.swipeTextScrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Pressable
                  {...cardPressProps}
                  style={({ pressed }) => [
                    pressed && onCardPress ? { opacity: 0.98 } : null,
                  ]}
                >
                  <View style={[styles.textBody, styles.textBodySwipe]}>{textBodyInner}</View>
                </Pressable>
                {footerBlock}
              </ScrollView>
            </View>
          ) : (
            <>
              <Pressable
                {...cardPressProps}
                style={({ pressed }) => [
                  pressed && onCardPress ? { opacity: 0.98 } : null,
                ]}
              >
                {imageBlock}
                <View style={[styles.textBody, swipeMode && styles.textBodySwipe]}>{textBodyInner}</View>
              </Pressable>
              {footerBlock}
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bookmarkHit: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 30,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
  },
  frameSwipe: {
    borderRadius: radius.xl,
  },
  column: {
    position: "relative",
    flexDirection: "column",
    width: "100%",
    flexShrink: 0,
  },
  columnDeckFit: {
    flex: 1,
    minHeight: 0,
  },
  swipeDeckBody: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  },
  swipeTextScroll: {
    flex: 1,
    minHeight: 0,
  },
  swipeTextScrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xs,
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
  imageCategoryRow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    zIndex: 4,
    gap: 8,
  },
  imageCategory: {
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(255,255,255,0.92)",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  dateBadgePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(15,23,42,0.88)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  dateBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "rgba(255,255,255,0.95)",
    letterSpacing: 0.3,
  },
  closesSoonPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(217,161,91,0.95)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  closesSoonText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1a1208",
  },
  textBody: {
    backgroundColor: "#161412",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 2,
    borderTopColor: "rgba(255,255,255,0.14)",
  },
  textBodySwipe: {
    borderTopWidth: 0,
    paddingTop: spacing.sm,
  },
  textPanelFooter: {
    backgroundColor: "#161412",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: 4,
  },
  textPanelFooterSwipe: {
    paddingTop: 0,
    paddingBottom: spacing.sm,
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
  metaLine: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.65)",
  },
  showtimeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  showtimeChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  showtimeChipText: {
    fontSize: 13,
    fontWeight: "800",
  },
  swipeHintFooter: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
  },
  description: {
    marginTop: 10,
    fontSize: font.sizeMd,
    lineHeight: 22,
    fontWeight: "500",
    color: "rgba(255,255,255,0.88)",
  },
  descriptionSwipe: {
    marginTop: 6,
    fontSize: font.sizeSm,
    lineHeight: 19,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
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
