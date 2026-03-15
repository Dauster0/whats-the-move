import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useThemeColors } from "../hooks/use-theme-colors";
import { trackError, trackEvent } from "../lib/analytics";
import { getAIGrounding } from "../lib/ai-grounding";
import { getReadableLocation } from "../lib/location";
import { isNightlifeTime } from "../lib/time-of-day";
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

type Move = {
  title: string;
  subtitle: string;
  reason: string;
  durationMinutes: number;
  kind: "place" | "event" | "generic";
  actionType: "maps" | "tickets" | "none";
  sourceName: string;
  address: string;
  mapQuery: string;
  externalUrl: string;
  distanceText?: string;
  priceText?: string;
  category?: string;
};

export default function WhatsTheMoveAI() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [locationLabel, setLocationLabel] = useState("Loading location...");
  const [moves, setMoves] = useState<Move[]>([]);
  const [photoUrls, setPhotoUrls] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [intent, setIntent] = useState<"calm" | "energetic" | "don't care">("don't care");
  const [timeRange, setTimeRange] = useState("1 hr+");

  useEffect(() => {
    loadMoves();
  }, []);

  useEffect(() => {
    if (moves.length === 0) {
      setPhotoUrls([]);
      return;
    }
    const area = locationLabel !== "Loading location..." ? locationLabel : "";
    Promise.all(
      moves.map((m) => {
        const q = m.mapQuery || m.sourceName || m.title;
        if (!q || q.length < 2) return Promise.resolve(null);
        const areaParam = area ? `&area=${encodeURIComponent(area)}` : "";
        const categoryParam = m.category ? `&category=${encodeURIComponent(m.category)}` : "";
        return fetch(`${SERVER_URL}/place-photo?q=${encodeURIComponent(q)}${areaParam}${categoryParam}`)
          .then((r) => r.json())
          .then((d) => d.photoUrl ?? null)
          .catch(() => null);
      })
    ).then(setPhotoUrls);
  }, [moves, locationLabel]);

  async function loadMoves() {
    setLoading(true);
    setErrorText("");
    let areaForError = "unknown";

    try {
      const location = await getReadableLocation();
      const place = location.place || "near you";
      areaForError = place;
      setLocationLabel(place);

      // Run grounding and AI expansion in parallel—AI uses its knowledge of real venues
      const [grounding, expandRes] = await Promise.all([
        getAIGrounding({
          area: place,
          lat: location.lat ?? undefined,
          lng: location.lon ?? undefined,
          mood: intent === "don't care" ? "" : intent,
          timeRange,
        }),
        fetch(`${SERVER_URL}/expand-moves`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            area: place,
            timeRange,
            mood: intent === "don't care" ? "" : intent,
            currentTime: new Date().toISOString(),
          }),
        }).catch(() => null),
      ]);

      let candidates = grounding.candidates;

      // Merge AI suggestions (from its knowledge of real places)
      try {
        const expandData = expandRes?.ok ? await expandRes.json() : null;
        const aiMoves = expandData?.moves ?? [];
        if (Array.isArray(aiMoves) && aiMoves.length > 0) {
          let aiCandidates = aiMoves.map((m: any, i: number) => ({
            id: `ai-${i}-${Date.now()}`,
            kind: "place" as const,
            category: m.category || "other",
            exactTitle: m.title ?? `Go to ${m.sourceName ?? "this spot"}`,
            sourceName: m.sourceName ?? "",
            subtitle: m.subtitle ?? "A specific place worth checking out",
            reasonHints: [m.reason ?? "Suggested for your area"],
            durationMinutes: m.durationMinutes ?? 90,
            address: m.address ?? "",
            mapQuery: m.mapQuery ?? m.sourceName ?? "",
            actionType: "maps" as const,
            externalUrl: m.externalUrl ?? "",
            distanceText: m.distanceText ?? "",
            priceText: (m.priceText as "$$") ?? "$$",
            score: 9,
          }));
          if (!isNightlifeTime()) {
            aiCandidates = aiCandidates.filter((m) => {
              const cat = (m.category || "").toLowerCase();
              const title = (m.exactTitle || "").toLowerCase();
              if (cat === "nightclub") return false;
              if (title.includes("clubbing") || title.includes("rave")) return false;
              return true;
            });
          }
          // When AI returns plenty of unique suggestions, prefer them over curated
          if (aiCandidates.length >= 8) {
            candidates = [...aiCandidates, ...candidates.filter((c) => !c.id.startsWith("la-") && !c.id.startsWith("nyc-") && !c.id.startsWith("sf-"))];
          } else {
            candidates = [...aiCandidates, ...candidates];
          }
        }
      } catch (_) {
        // AI expansion is optional
      }

      // Filter unnamed/generic suggestions
      candidates = candidates.filter((c) => {
        const t = (c.exactTitle ?? "").toLowerCase();
        const s = (c.sourceName ?? "").toLowerCase();
        if (t.includes("unnamed") || s.includes("unnamed")) return false;
        if (t.includes("unnamed place")) return false;
        return true;
      });

      // No bars or nightlife at noon—filter when it's daytime
      if (!isNightlifeTime()) {
        candidates = candidates.filter((c) => {
          if (c.category === "nightclub" || c.category === "bar") return false;
          const t = (c.exactTitle ?? "").toLowerCase();
          if (t.includes("clubbing") || t.includes("go clubbing")) return false;
          if (t.includes("craft cocktails") || t.includes("grab a drink")) return false;
          return true;
        });
      }

      const isDiscovered = (c: { id: string }) =>
        c.id.startsWith("overpass-") || c.id.startsWith("place-") || c.id.startsWith("event-");
      const discovered = candidates.filter(isDiscovered);
      let preferred = discovered.length >= 3 ? discovered : candidates;

      if (location.lat != null && location.lon != null && preferred.length > 0) {
        try {
          const enrichRes = await fetch(`${SERVER_URL}/enrich-drive-times`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              candidates: preferred,
              lat: location.lat,
              lon: location.lon,
              area: place,
            }),
          });
          if (enrichRes.ok) {
            const { candidates: enriched } = await enrichRes.json();
            if (Array.isArray(enriched) && enriched.length > 0) preferred = enriched;
          }
        } catch (_) {
          // enrichment is best-effort
        }
      }

      function shuffle<T>(arr: T[]): T[] {
        const out = [...arr];
        for (let i = out.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
      }

      function pickDiverse(cands: typeof candidates, n: number) {
        const shuffledCands = shuffle(cands);
        const byCategory = new Map<string, typeof candidates>();
        for (const c of shuffledCands) {
          const cat = c.category || "other";
          if (!byCategory.has(cat)) byCategory.set(cat, []);
          byCategory.get(cat)!.push(c);
        }
        for (const [cat, arr] of byCategory.entries()) {
          arr.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          byCategory.set(cat, shuffle(arr));
        }
        const categoryOrder = [
          "restaurant", "cafe", "park", "museum", "bookstore", "gallery",
          "scenic", "trail", "comedy", "theater", "cinema",
          "market", "bakery", "ice_cream", "bar", "nightclub",
        ];
        const categories = shuffle(
          Array.from(byCategory.keys()).sort(
            (a, b) =>
              (categoryOrder.indexOf(a) >= 0 ? categoryOrder.indexOf(a) : 99) -
              (categoryOrder.indexOf(b) >= 0 ? categoryOrder.indexOf(b) : 99)
          )
        );
        const picked: typeof candidates = [];
        const maxPerCategory: Record<string, number> = { bar: 1 };
        let round = 0;
        while (picked.length < n && round < 10) {
          for (const cat of categories) {
            const arr = byCategory.get(cat)!;
            const max = maxPerCategory[cat] ?? 2;
            const alreadyFromCat = picked.filter((p) => (p.category || "other") === cat).length;
            if (alreadyFromCat >= max) continue;
            const available = arr.filter((c) => !picked.includes(c));
            if (available.length === 0) continue;
            const c = available[Math.floor(Math.random() * available.length)];
            if (c) {
              picked.push(c);
              if (picked.length >= n) break;
            }
          }
          round++;
        }
        if (picked.length < n) {
          const rest = cands.filter((c) => !picked.includes(c));
          picked.push(...shuffle(rest).slice(0, n - picked.length));
        }
        return shuffle(picked.slice(0, n));
      }

      function getFallbackMoves(area: string): Move[] {
        const searchArea = area === "near you" ? "near me" : area;
        return [
          {
            title: "Find coffee shops",
            subtitle: `Search ${searchArea} on Google Maps`,
            reason: "We couldn't find specific places in your area—tap to search on Maps.",
            durationMinutes: 45,
            kind: "generic",
            actionType: "maps",
            sourceName: "Google Maps",
            address: "",
            mapQuery: `coffee shops ${searchArea}`,
            externalUrl: "",
            distanceText: "",
            priceText: "$$",
          },
          {
            title: "Find parks",
            subtitle: `Search ${searchArea} on Google Maps`,
            reason: "Tap to find parks and outdoor spots near you.",
            durationMinutes: 60,
            kind: "generic",
            actionType: "maps",
            sourceName: "Google Maps",
            address: "",
            mapQuery: `parks ${searchArea}`,
            externalUrl: "",
            distanceText: "",
            priceText: "$",
          },
          {
            title: "Find restaurants",
            subtitle: `Search ${searchArea} on Google Maps`,
            reason: "Tap to browse restaurants and cafes in your area.",
            durationMinutes: 90,
            kind: "generic",
            actionType: "maps",
            sourceName: "Google Maps",
            address: "",
            mapQuery: `restaurants ${searchArea}`,
            externalUrl: "",
            distanceText: "",
            priceText: "$$",
          },
        ];
      }

      const pick6 = pickDiverse(preferred, 6);

      if (pick6.length === 0 && candidates.length === 0) {
        trackEvent("fallback_used", { reason: "no_candidates", area: place });
        setMoves(getFallbackMoves(place));
        setLoading(false);
        return;
      }

      if (pick6.length >= 1) {
        const movesList: Move[] = pick6.map((c) => {
          const venueName = c.sourceName || c.exactTitle?.split(" — ")[0] || c.exactTitle || "";
          const hook = c.exactTitle?.includes(" — ")
            ? c.exactTitle.split(" — ")[1]
            : (c.exactTitle || c.subtitle || "A real place near you");
          return {
          title: venueName,
          subtitle: hook,
          reason: c.reasonHints?.[0] ?? `${c.distanceText ?? "Nearby"}. Specific and doable.`,
          durationMinutes: c.durationMinutes ?? 45,
          kind: c.kind ?? "place",
          actionType: c.actionType ?? "maps",
          sourceName: c.sourceName ?? "",
          address: c.address ?? "",
          mapQuery: c.mapQuery ?? "",
          externalUrl: c.externalUrl ?? "",
          distanceText: c.distanceText,
          priceText: c.priceText,
          category: c.category,
        };
        });
        trackEvent("moves_loaded", { source: "grounding", count: movesList.length, area: place });
        setMoves(movesList);
        return;
      }

      const response = await fetch(`${SERVER_URL}/generate-moves`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          place,
          lat: location.lat,
          lon: location.lon,
          timeRange,
          intent,
          location: place,
          mood: intent === "don't care" ? "" : intent,
          candidates,
          currentTime: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      const rawMoves = data.moves ?? data.suggestions ?? [];

      if (!Array.isArray(rawMoves) || rawMoves.length === 0) {
        trackEvent("fallback_used", { reason: "generate_empty", area: place });
        setMoves(getFallbackMoves(place));
        return;
      }

      const movesList: Move[] = rawMoves.map((m: any) => {
        const rawTitle = m.title ?? "";
        const venueName = m.sourceName || rawTitle?.split(" — ")[0] || rawTitle || "";
        const hook = rawTitle?.includes(" — ")
          ? rawTitle.split(" — ")[1]
          : (rawTitle || m.subtitle || "A real place near you");
        return {
        title: venueName,
        subtitle: hook,
        reason: m.reason ?? "",
        durationMinutes: m.durationMinutes ?? 30,
        kind: m.kind ?? "generic",
        actionType: m.actionType ?? "none",
        sourceName: m.sourceName ?? "",
        address: m.address ?? "",
        mapQuery: m.mapQuery ?? "",
        externalUrl: m.externalUrl ?? "",
        distanceText: m.distanceText,
        priceText: m.priceText,
        category: m.category,
      };
      });

      trackEvent("moves_loaded", { source: "generate", count: movesList.length, area: place });
      setMoves(movesList);
    } catch (error) {
      trackError(error, {
        screen: "whats-the-move-ai",
        action: "loadMoves",
        area: areaForError,
      });
      const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
      if (msg.includes("network") || msg.includes("fetch") || msg.includes("failed to fetch")) {
        setErrorText("Check your connection and try again.");
      } else if (msg.includes("no valid moves") || msg.includes("no places")) {
        setErrorText("No places found in your area. Try a different time or location.");
      } else {
        setErrorText("Something went wrong. Tap to try again.");
      }
      setMoves([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backArrow}>← Back</Text>
      </Pressable>
      <Text style={styles.eyebrow}>Real places near you</Text>
      <Text style={styles.header}>Find something to do</Text>
      <Text style={styles.subheader}>
        We'll show cafes, comedy shows, parks & more—tap to see details and get directions.
      </Text>

      <View style={styles.contextBox}>
        <Text style={styles.contextLabel}>Searching near</Text>
        <Text style={styles.contextValue}>{locationLabel}</Text>
        {locationLabel === "near you" && (
          <Text style={styles.contextHint}>
            Enable location for places near you
          </Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Energy level</Text>
      <View style={styles.row}>
        {(["calm", "energetic", "don't care"] as const).map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles.choiceButton, intent === value && styles.choiceButtonActive]}
            onPress={() => setIntent(value)}
          >
            <Text style={[styles.choiceText, intent === value && styles.choiceTextActive]}>
              {value === "don't care" ? "Either" : value}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Time you have</Text>
      <View style={styles.row}>
        {[
          { value: "1–15 min", label: "Quick" },
          { value: "10–30 min", label: "Short" },
          { value: "30–60 min", label: "Medium" },
          { value: "1 hr+", label: "Flexible" },
        ].map(({ value, label }) => (
          <TouchableOpacity
            key={value}
            style={[styles.choiceButton, timeRange === value && styles.choiceButtonActive]}
            onPress={() => setTimeRange(value)}
          >
            <Text style={[styles.choiceText, timeRange === value && styles.choiceTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.generateButton, loading && styles.generateButtonDisabled]}
        onPress={() => {
          if (!loading) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            loadMoves();
          }
        }}
        disabled={loading}
      >
        <Text style={styles.generateButtonText}>
          {loading ? "Finding places…" : "Find places"}
        </Text>
      </TouchableOpacity>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Searching nearby places & events</Text>
        </View>
      )}

      {errorText !== "" && !loading && (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{errorText}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadMoves}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && errorText === "" && moves.length === 0 && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyEmoji}>📍</Text>
          <Text style={styles.emptyTitle}>Tap "Find places" above</Text>
          <Text style={styles.emptySub}>
            We'll show real spots near you—restaurants, events, parks & more
          </Text>
        </View>
      )}

      {moves.map((move, index) => (
        <Pressable
          key={index}
          style={styles.card}
          onPress={() =>
            router.push({
              pathname: "/move-detail",
              params: {
                title: move.title,
                subtitle: move.subtitle,
                reason: move.reason,
                durationMinutes: String(move.durationMinutes),
                sourceName: move.sourceName,
                address: move.address,
                mapQuery: move.mapQuery,
                externalUrl: move.externalUrl,
                distanceText: move.distanceText ?? "",
                priceText: move.priceText ?? "$$",
                actionType: move.actionType,
                area: locationLabel,
                category: move.category ?? "",
              },
            })
          }
        >
          <View style={styles.cardPhotoWrap}>
            {photoUrls[index] ? (
              <Image
                source={{ uri: photoUrls[index]! }}
                style={styles.cardPhoto}
                contentFit="cover"
                contentPosition="center"
              />
            ) : (
              <View style={styles.cardPhotoPlaceholder}>
                <View style={styles.cardPhotoPlaceholderInner}>
                  <Text style={styles.cardPhotoPlaceholderText}>View on Maps for photos</Text>
                </View>
              </View>
            )}
          </View>
          <Text style={styles.cardTitle}>{move.title}</Text>
          <Text style={styles.cardSubtitle}>{move.subtitle}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaPill}>{move.durationMinutes} min</Text>
            {move.distanceText ? (
              <Text style={styles.metaPill}>{displayDistanceText(move.distanceText ?? "")}</Text>
            ) : null}
            {move.priceText ? (
              <Text style={styles.metaPill}>{move.priceText}</Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingTop: 56,
    paddingHorizontal: spacing.md,
    paddingBottom: 40,
  },
  backBtn: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  backArrow: {
    fontSize: font.sizeMd,
    color: colors.accent,
    fontWeight: "600",
  },
  eyebrow: {
    fontSize: font.sizeSm,
    fontWeight: "700",
    letterSpacing: 2,
    color: colors.textMuted,
    marginBottom: 8,
  },
  header: {
    fontSize: 36,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 6,
  },
  subheader: {
    fontSize: font.sizeMd,
    color: colors.textSub,
    marginBottom: 20,
  },
  contextBox: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  contextLabel: {
    fontSize: font.sizeSm,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 6,
  },
  contextValue: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  contextHint: {
    fontSize: font.sizeSm,
    color: colors.textMuted,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: font.sizeSm,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: colors.textMuted,
    marginBottom: 10,
    marginTop: 10,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  choiceButton: {
    backgroundColor: colors.bgMuted,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.md,
  },
  choiceButtonActive: {
    backgroundColor: colors.bgDark,
  },
  choiceText: {
    color: colors.text,
    fontSize: font.sizeMd,
    fontWeight: "700",
  },
  choiceTextActive: {
    color: colors.textInverse,
  },
  generateButton: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  generateButtonDisabled: {
    opacity: 0.7,
  },
  generateButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "800",
  },
  loadingBox: {
    marginTop: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  errorBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: "#fef2f2",
    borderRadius: radius.md,
    alignItems: "center",
    gap: spacing.sm,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: colors.bgDark,
    borderRadius: radius.md,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyBox: {
    marginTop: spacing.xl,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptySub: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
  },
  error: {
    color: "#c44f3a",
    fontSize: 16,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: 0,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardPhotoWrap: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: colors.bgCardSoft,
  },
  cardPhoto: {
    width: "100%",
    height: "100%",
  },
  cardPhotoPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.bgMuted,
  },
  cardPhotoPlaceholderInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  cardPhotoPlaceholderText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: "600",
  },
  cardTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  cardSubtitle: {
    fontSize: 17,
    color: colors.textSub,
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 20,
    width: "100%",
  },
  metaPill: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    backgroundColor: colors.bgCardSoft,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
});
}