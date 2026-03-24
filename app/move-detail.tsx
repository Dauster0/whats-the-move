import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useThemeColors } from "../hooks/use-theme-colors";
import {
  buildBookingActions,
  openBookingUrl,
} from "../lib/booking-links";
import { font, radius, spacing } from "../lib/theme";

const SERVER_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.154:3001";

function displayDistanceText(text: string): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  if (lower.includes("drive")) return text;
  const miMatch = lower.match(/(\d+\.?\d*)\s*mi\s*away/);
  if (miMatch) {
    const miles = parseFloat(miMatch[1]);
    const mins = Math.max(2, Math.round(miles * 3));
    return `~${mins} min drive`;
  }
  if (lower.includes("km away")) {
    const kmMatch = lower.match(/(\d+\.?\d*)\s*km/);
    if (kmMatch) {
      const km = parseFloat(kmMatch[1]);
      const mins = Math.max(2, Math.round((km / 1.6) * 3));
      return `~${mins} min drive`;
    }
  }
  if (lower === "nearby") return "~5 min drive";
  if (text.length > 22) {
    const map: Record<string, string> = {
      "transit depending on where you are": "Transit",
      "subway or walk depending on where you are": "Transit",
      "transit or drive depending on where you are": "Transit",
    };
    return map[lower] ?? text;
  }
  return text;
}

function RatingRow({
  rating,
  count,
  colors,
}: {
  rating: number;
  count: number | null;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const fullStars = Math.round(rating);
  const label =
    count != null && count > 0
      ? `${rating.toFixed(1)} / 5 · ${count.toLocaleString()} Google reviews`
      : `${rating.toFixed(1)} / 5 on Google`;
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ fontSize: font.sizeSm, color: colors.textMuted, marginBottom: 4 }}>
        Rating
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Text style={{ fontSize: font.sizeLg, fontWeight: "800", color: colors.text }}>
          {rating.toFixed(1)}
          <Text style={{ fontWeight: "600", color: colors.textMuted }}> / 5</Text>
        </Text>
        <Text style={{ fontSize: font.sizeMd, color: colors.accent }}>
          {"★".repeat(fullStars)}
          {"☆".repeat(Math.max(0, 5 - fullStars))}
        </Text>
      </View>
      <Text style={{ fontSize: font.sizeSm, color: colors.textSub, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

export default function MoveDetailScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const windowWidth = Dimensions.get("window").width;
  const carouselWidth = windowWidth - spacing.md * 2;
  const photoHeight = (carouselWidth * 3) / 4;

  const params = useLocalSearchParams<{
    title: string;
    subtitle: string;
    reason: string;
    durationMinutes: string;
    sourceName: string;
    address: string;
    mapQuery: string;
    externalUrl: string;
    distanceText: string;
    priceText: string;
    actionType: string;
    area?: string;
    category?: string;
    dateText?: string;
    hoursSummary?: string;
    userLat?: string;
    userLng?: string;
    openNow?: string;
  }>();

  const title = params.title ?? "";
  const subtitle = params.subtitle ?? "";
  const reason = params.reason ?? "";
  const durationMinutes = params.durationMinutes ?? "45";
  const sourceName = params.sourceName ?? "";
  const address = params.address ?? "";
  const mapQuery = params.mapQuery ?? title;
  const externalUrl = params.externalUrl ?? "";
  const distanceText = params.distanceText ?? "";
  const priceText = params.priceText ?? "$$";
  const actionType = params.actionType ?? "maps";
  const area = params.area ?? "";
  const category = params.category ?? "";
  const dateText = params.dateText ?? "";
  const hoursSummary = params.hoursSummary ?? "";
  const userLat = params.userLat ?? "";
  const userLng = params.userLng ?? "";
  const openNowFromList = params.openNow === "true";

  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoAttributions, setPhotoAttributions] = useState<
    { name: string; profileUrl?: string }[]
  >([]);
  const [rating, setRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [googleSummary, setGoogleSummary] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [detailLoading, setDetailLoading] = useState(true);
  const [websiteUri, setWebsiteUri] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [googleMapsListingUrl, setGoogleMapsListingUrl] = useState<string | null>(
    null
  );

  const bookingActions = useMemo(
    () =>
      buildBookingActions({
        venueName: sourceName || title || mapQuery,
        address,
        area,
        category,
        websiteUri,
        phoneNumber,
      }),
    [sourceName, title, mapQuery, address, area, category, websiteUri, phoneNumber]
  );

  useEffect(() => {
    const q = mapQuery || sourceName || title;
    if (!q || q.length < 2) {
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);

    const areaParam = area ? `&area=${encodeURIComponent(area)}` : "";
    const categoryParam = category ? `&category=${encodeURIComponent(category)}` : "";
    const addressParam = address ? `&address=${encodeURIComponent(address)}` : "";
    const sourceParam = `&sourceName=${encodeURIComponent(sourceName || q)}`;
    const latParam = userLat ? `&lat=${encodeURIComponent(userLat)}` : "";
    const lngParam = userLng ? `&lng=${encodeURIComponent(userLng)}` : "";
    const refreshParam = `&refresh=${encodeURIComponent(String(Date.now()))}`;
    const detailUrl = `${SERVER_URL}/place-details?q=${encodeURIComponent(q)}${areaParam}${categoryParam}${addressParam}${sourceParam}${latParam}${lngParam}${refreshParam}`;
    const photoFallbackUrl = `${SERVER_URL}/place-photo?q=${encodeURIComponent(q)}${areaParam}${categoryParam}${addressParam}${sourceParam}${latParam}${lngParam}${refreshParam}`;

    async function loadDetail() {
      try {
        const r = await fetch(detailUrl, { cache: "no-store" });
        if (cancelled) return;
        const d = await r.json().catch(() => ({}));
        let urls = Array.isArray(d.photoUrls) ? d.photoUrls.filter(Boolean) : [];
        let attr: { name: string; profileUrl?: string }[] = Array.isArray(d.photoAttributions)
          ? d.photoAttributions.filter((a: { name?: string }) => a && typeof a.name === "string")
          : [];
        if (urls.length === 0) {
          const pr = await fetch(photoFallbackUrl, { cache: "no-store" });
          if (cancelled) return;
          const pd = await pr.json().catch(() => ({}));
          if (pd?.photoUrl && typeof pd.photoUrl === "string") {
            urls = [pd.photoUrl];
            if (pd.photoAttribution?.name) {
              attr = [
                {
                  name: String(pd.photoAttribution.name),
                  profileUrl: pd.photoAttribution.profileUrl,
                },
              ];
            }
          }
        }
        if (cancelled) return;
        setPhotoUrls(urls);
        setPhotoAttributions(attr);
        setRating(typeof d.rating === "number" ? d.rating : null);
        setReviewCount(typeof d.userRatingCount === "number" ? d.userRatingCount : null);
        setGoogleSummary(typeof d.summary === "string" && d.summary.length > 0 ? d.summary : null);
        setWebsiteUri(typeof d.websiteUri === "string" && d.websiteUri ? d.websiteUri : null);
        setPhoneNumber(typeof d.phoneNumber === "string" && d.phoneNumber ? d.phoneNumber : null);
        setGoogleMapsListingUrl(
          typeof d.googleMapsUri === "string" && d.googleMapsUri ? d.googleMapsUri : null
        );
        setPhotoIndex(0);
      } catch {
        if (!cancelled) {
          setPhotoUrls([]);
          setPhotoAttributions([]);
          setRating(null);
          setReviewCount(null);
          setGoogleSummary(null);
          setWebsiteUri(null);
          setPhoneNumber(null);
          setGoogleMapsListingUrl(null);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [mapQuery, sourceName, title, area, category, address, userLat, userLng]);

  function onPhotoScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / Math.max(carouselWidth, 1));
    setPhotoIndex(i);
  }

  function openMaps() {
    if (googleMapsListingUrl) {
      Linking.openURL(googleMapsListingUrl);
      return;
    }
    const query = encodeURIComponent(mapQuery + (address ? ` ${address}` : ""));
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }

  function openTickets() {
    if (externalUrl) Linking.openURL(externalUrl);
  }

  const showCarousel = photoUrls.length > 0;
  const primaryDescription = googleSummary || subtitle;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backArrow}>←</Text>
      </Pressable>

      <View style={[styles.photoWrap, { width: carouselWidth, height: photoHeight }]}>
        {detailLoading ? (
          <View style={[styles.photoLoading, { width: carouselWidth, height: photoHeight }]}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.photoLoadingText}>Loading photos…</Text>
          </View>
        ) : showCarousel ? (
          <>
            <FlatList
              data={photoUrls}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              style={{ height: photoHeight }}
              keyExtractor={(uri, i) => `${i}-${uri.slice(-40)}`}
              onMomentumScrollEnd={onPhotoScroll}
              getItemLayout={(_, index) => ({
                length: carouselWidth,
                offset: carouselWidth * index,
                index,
              })}
              renderItem={({ item }) => (
                <View style={{ width: carouselWidth, height: photoHeight }}>
                  <Image
                    recyclingKey={item}
                    source={{ uri: item }}
                    style={{ width: carouselWidth, height: photoHeight }}
                    contentFit="cover"
                    contentPosition="center"
                  />
                </View>
              )}
            />
            {photoUrls.length > 1 ? (
              <View style={styles.dotsRow}>
                {photoUrls.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      i === photoIndex ? styles.dotActive : styles.dotInactive,
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <View style={[styles.photoPlaceholder, { width: carouselWidth, height: photoHeight }]}>
            <Text style={styles.photoPlaceholderText}>
              Add an Unsplash API key on the server for editorial photos — or open Maps below for
              venue images & reviews
            </Text>
          </View>
        )}
      </View>

      {showCarousel && photoAttributions[photoIndex]?.name ? (
        <View style={[styles.photoCreditRow, { maxWidth: carouselWidth }]}>
          <Text style={styles.photoCredit}>Photo by </Text>
          <Pressable
            onPress={() =>
              Linking.openURL(
                photoAttributions[photoIndex].profileUrl || "https://unsplash.com"
              )
            }
          >
            <Text style={styles.photoCreditLink}>{photoAttributions[photoIndex].name}</Text>
          </Pressable>
          <Text style={styles.photoCredit}> on Unsplash</Text>
        </View>
      ) : null}

      <Text style={styles.title}>{title}</Text>

      {openNowFromList ? (
        <View style={styles.openNowBanner}>
          <Text style={styles.openNowBannerText}>
            Listed as open now when we searched — tap Maps to double-check.
          </Text>
        </View>
      ) : null}

      {rating != null && rating > 0 ? (
        <RatingRow rating={rating} count={reviewCount} colors={colors} />
      ) : null}

      {primaryDescription ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{googleSummary ? "About" : "What to expect"}</Text>
          <Text style={styles.bodyText}>{primaryDescription}</Text>
        </View>
      ) : null}

      {reason && reason !== primaryDescription ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Why go</Text>
          <Text style={styles.bodyText}>{reason}</Text>
        </View>
      ) : null}

      <View style={styles.metaRow}>
        {dateText && !(primaryDescription || "").includes(dateText) ? (
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{dateText}</Text>
          </View>
        ) : null}
        <View style={styles.metaPill}>
          <Text style={styles.metaLabel}>Duration</Text>
          <Text style={styles.metaValue}>{durationMinutes} min</Text>
        </View>
        {distanceText ? (
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Distance</Text>
            <Text style={styles.metaValue}>{displayDistanceText(distanceText)}</Text>
          </View>
        ) : null}
        {priceText ? (
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Price</Text>
            <Text style={styles.metaValue}>{priceText}</Text>
          </View>
        ) : null}
        {hoursSummary ? (
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Hours</Text>
            <Text style={styles.metaValue}>{hoursSummary}</Text>
          </View>
        ) : null}
      </View>

      {address ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Address</Text>
          <Text style={styles.address}>{address}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.actionGrid}>
          {actionType === "tickets" && externalUrl ? (
            <Pressable style={styles.primaryButton} onPress={openTickets}>
              <Text style={styles.primaryButtonText}>Get tickets</Text>
              <Text style={styles.primaryButtonSub}>
                Official checkout in your browser, one tap from here
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            style={
              actionType === "tickets" && externalUrl
                ? styles.secondaryButton
                : styles.primaryButton
            }
            onPress={openMaps}
          >
            <Text
              style={
                actionType === "tickets" && externalUrl
                  ? styles.secondaryButtonText
                  : styles.primaryButtonText
              }
            >
              {googleMapsListingUrl ? "Open Google Maps listing" : "View on Google Maps"}
            </Text>
            {actionType === "tickets" && externalUrl ? null : (
              <Text style={styles.primaryButtonSub}>
                {googleMapsListingUrl
                  ? "Official listing — often has Reserve"
                  : "More photos, full reviews, hours & directions"}
              </Text>
            )}
            {actionType === "tickets" && externalUrl ? (
              <Text style={styles.secondaryButtonSub}>Photos, reviews, hours & directions</Text>
            ) : null}
          </Pressable>

          {bookingActions.map((a) => (
            <Pressable
              key={a.id}
              style={styles.secondaryButton}
              onPress={() => void openBookingUrl(a.url)}
            >
              <Text style={styles.secondaryButtonText}>{a.label}</Text>
              <Text style={styles.secondaryButtonSub}>{a.subtitle}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  const isDark = colors.bg === "#12100E";
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    content: {
      paddingTop: 60,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xxl,
    },
    backBtn: {
      alignSelf: "flex-start",
      padding: spacing.xs,
      marginBottom: spacing.md,
    },
    backArrow: {
      fontSize: 28,
      color: colors.text,
      fontWeight: "600",
    },
    photoWrap: {
      alignSelf: "center",
      maxWidth: "100%",
      borderRadius: radius.lg,
      overflow: "hidden",
      marginBottom: spacing.lg,
      backgroundColor: colors.bgMuted,
      position: "relative",
    },
    photo: {
      width: "100%",
      height: "100%",
    },
    photoLoading: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      minHeight: 200,
    },
    photoLoadingText: {
      marginTop: spacing.sm,
      fontSize: font.sizeSm,
      color: colors.textMuted,
    },
    photoPlaceholder: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.lg,
      minHeight: 180,
    },
    photoPlaceholderText: {
      fontSize: font.sizeSm,
      color: colors.textMuted,
      textAlign: "center",
    },
    photoCreditRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      alignSelf: "center",
      marginBottom: spacing.md,
      paddingHorizontal: spacing.xs,
    },
    photoCredit: {
      fontSize: font.sizeSm,
      color: colors.textMuted,
    },
    photoCreditLink: {
      fontSize: font.sizeSm,
      color: colors.accent,
      textDecorationLine: "underline",
    },
    dotsRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 6,
      paddingVertical: spacing.xs,
      position: "absolute",
      bottom: 10,
      left: 0,
      right: 0,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    dotActive: {
      backgroundColor: "#FFFFFF",
    },
    dotInactive: {
      backgroundColor: "rgba(255,255,255,0.4)",
    },
    title: {
      fontSize: font.sizeXxl,
      fontWeight: "800",
      color: colors.text,
      lineHeight: 38,
      marginBottom: spacing.sm,
    },
    openNowBanner: {
      backgroundColor: "rgba(34, 197, 94, 0.18)",
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: "rgba(34, 197, 94, 0.45)",
    },
    openNowBannerText: {
      fontSize: font.sizeSm,
      fontWeight: "600",
      color: colors.text,
    },
    bodyText: {
      fontSize: font.sizeMd,
      lineHeight: 24,
      color: colors.textSub,
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginBottom: spacing.lg,
      width: "100%",
    },
    metaPill: {
      backgroundColor: colors.bgCard,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    metaLabel: {
      fontSize: font.sizeXs,
      fontWeight: "700",
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    metaValue: {
      fontSize: font.sizeMd,
      fontWeight: "700",
      color: colors.text,
    },
    section: {
      marginBottom: spacing.xl,
    },
    sectionTitle: {
      fontSize: font.sizeSm,
      fontWeight: "600",
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: spacing.xs,
    },
    address: {
      fontSize: font.sizeMd,
      color: colors.textSub,
      lineHeight: 24,
    },
    actionGrid: {
      gap: spacing.sm,
    },
    primaryButton: {
      backgroundColor: colors.bgDark,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.lg,
      marginBottom: spacing.sm,
    },
    primaryButtonText: {
      fontSize: font.sizeLg,
      fontWeight: "700",
      color: isDark ? colors.text : colors.textInverse,
    },
    primaryButtonSub: {
      fontSize: font.sizeSm,
      color: isDark ? colors.textMuted : "rgba(255,255,255,0.8)",
      marginTop: 4,
    },
    secondaryButton: {
      backgroundColor: colors.bgCard,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    secondaryButtonText: {
      fontSize: font.sizeMd,
      fontWeight: "700",
      color: colors.text,
    },
    secondaryButtonSub: {
      fontSize: font.sizeSm,
      color: colors.textMuted,
      marginTop: 4,
    },
  });
}
