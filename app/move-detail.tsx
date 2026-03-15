import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../hooks/use-theme-colors";
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

export default function MoveDetailScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(true);
  useEffect(() => {
    const q = mapQuery || sourceName || title;
    if (!q || q.length < 2) {
      setPhotoLoading(false);
      return;
    }
    setPhotoLoading(true);
    const areaParam = area ? `&area=${encodeURIComponent(area)}` : "";
    const categoryParam = category ? `&category=${encodeURIComponent(category)}` : "";
    fetch(`${SERVER_URL}/place-photo?q=${encodeURIComponent(q)}${areaParam}${categoryParam}`)
      .then((r) => r.json())
      .then((d) => {
        setPhotoUrl(d.photoUrl ?? null);
        setPhotoLoading(false);
      })
      .catch(() => {
        setPhotoUrl(null);
        setPhotoLoading(false);
      });
  }, [mapQuery, sourceName, title, area, category]);

  function openMaps() {
    const query = encodeURIComponent(mapQuery + (address ? ` ${address}` : ""));
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }

  function openTickets() {
    if (externalUrl) Linking.openURL(externalUrl);
  }

  function openReservations() {
    const place = sourceName || mapQuery || title;
    const query = encodeURIComponent(`${place} reservations`);
    Linking.openURL(`https://www.google.com/search?q=${query}`);
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backArrow}>←</Text>
      </Pressable>

      <View style={styles.photoWrap}>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.photo}
            contentFit="cover"
            contentPosition="center"
          />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Image
              source={{ uri: "https://placehold.co/800x400/e8e0d5/8c8074?text=View+on+Maps+for+photos" }}
              style={styles.photo}
              contentFit="cover"
            />
            <View style={styles.photoPlaceholderOverlay}>
              <Text style={styles.photoPlaceholderText}>
                {photoLoading ? "Loading photo…" : "Tap below to see photos on Google Maps"}
              </Text>
            </View>
          </View>
        )}
      </View>

      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      <View style={styles.metaRow}>
        <View style={styles.metaPill}>
          <Text style={styles.metaLabel}>Duration</Text>
          <Text style={styles.metaValue}>{durationMinutes} min</Text>
        </View>
        {priceText ? (
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Price</Text>
            <Text style={styles.metaValue}>{priceText}</Text>
          </View>
        ) : null}
        {distanceText ? (
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Distance</Text>
            <Text style={styles.metaValue}>{displayDistanceText(distanceText)}</Text>
          </View>
        ) : null}
      </View>

      {reason ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Why this move</Text>
          <Text style={styles.reason}>{reason}</Text>
        </View>
      ) : null}

      {address ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Address</Text>
          <Text style={styles.address}>{address}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.actionGrid}>
          <Pressable style={styles.primaryButton} onPress={openMaps}>
            <Text style={styles.primaryButtonText}>View on Google Maps</Text>
            <Text style={styles.primaryButtonSub}>
              See photos, reviews, hours & directions
            </Text>
          </Pressable>

          {actionType === "tickets" && externalUrl ? (
            <Pressable style={styles.secondaryButton} onPress={openTickets}>
              <Text style={styles.secondaryButtonText}>Get tickets</Text>
            </Pressable>
          ) : null}

          <Pressable style={styles.secondaryButton} onPress={openReservations}>
            <Text style={styles.secondaryButtonText}>Reserve a table</Text>
            <Text style={styles.secondaryButtonSub}>
              Search OpenTable, Resy & more
            </Text>
          </Pressable>
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
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: spacing.lg,
    backgroundColor: colors.bgMuted,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoPlaceholder: {
    width: "100%",
    height: "100%",
    position: "relative",
  },
  photoPlaceholderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  photoPlaceholderText: {
    fontSize: font.sizeSm,
    color: colors.textInverse,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  title: {
    fontSize: font.sizeXxl,
    fontWeight: "800",
    color: colors.text,
    lineHeight: 38,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: font.sizeMd,
    color: colors.textSub,
    marginBottom: spacing.lg,
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
  reason: {
    fontSize: font.sizeMd,
    lineHeight: 24,
    color: colors.textSub,
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
