import React, { useEffect, useMemo, useRef, useState } from "react";
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
import {
  isGroceryOrErrandPlace,
  isLateNightInappropriateVenue,
} from "../lib/place-filters";
import { isLateNightOutHours } from "../lib/time-of-day";
import { isNightlifeTime } from "../lib/time-of-day";
import type { HungerPreference } from "../lib/food-preference";
import type { AICandidate } from "../lib/curated-experiences";
import { buildUserContextLine } from "../lib/user-context-line";
import { font, radius, spacing } from "../lib/theme";
import { useMoveStore } from "../store/move-context";

const SERVER_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.154:3001";

function sanitizeMoveReason(reason: string, subtitle: string): string {
  const r = (reason || "").trim();
  if (
    !r ||
    /^(named place|named venue|timed event|specific destination)$/i.test(r)
  ) {
    return subtitle || "A real place and a clear plan instead of a vague night in.";
  }
  return r;
}

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
  /** From Ticketmaster (e.g. Apr 24, 2026) */
  dateText?: string;
  /** Opening hours from Google, shown in meta row */
  hoursSummary?: string;
  /** Google Places says open at this moment */
  openNow?: boolean;
};

/** Stable key so list rows + photos never swap when order changes (index keys cause wrong image on wrong card). */
function venueKeyForMove(m: Move): string {
  return [m.sourceName, m.mapQuery, m.title, m.subtitle].join("::");
}

export default function WhatsTheMoveAI() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { preferences } = useMoveStore();
  const [locationLabel, setLocationLabel] = useState("Loading location...");
  const [userCoords, setUserCoords] = useState<{ lat?: number; lng?: number }>({});
  const [moves, setMoves] = useState<Move[]>([]);
  /** Photos keyed by venue — avoids index/array races that reuse the wrong hero image on the wrong row. */
  const [photoByVenue, setPhotoByVenue] = useState<Record<string, string | null>>({});
  const photoFetchGen = useRef(0);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [intent, setIntent] = useState<"calm" | "energetic" | "don't care">("don't care");
  const [timeRange, setTimeRange] = useState("1 hr+");
  const [hunger, setHunger] = useState<HungerPreference>("any");

  useEffect(() => {
    loadMoves();
  }, []);

  useEffect(() => {
    const myGen = ++photoFetchGen.current;
    let cancelled = false;
    const snapshot = moves;

    async function loadPhotos() {
      if (snapshot.length === 0) {
        if (!cancelled && myGen === photoFetchGen.current) {
          setPhotoByVenue({});
        }
        return;
      }
      const batchId = Date.now();
      const area = locationLabel !== "Loading location..." ? locationLabel : "";
      let lat = userCoords.lat;
      let lng = userCoords.lng;
      if (lat == null || lng == null) {
        try {
          const loc = await getReadableLocation();
          if (loc.lat != null && loc.lon != null) {
            lat = loc.lat;
            lng = loc.lon;
          }
        } catch {
          /* keep null */
        }
      }
      const latParam =
        lat != null ? `&lat=${encodeURIComponent(String(lat))}` : "";
      const lngParam =
        lng != null ? `&lng=${encodeURIComponent(String(lng))}` : "";
      const urls = await Promise.all(
        snapshot.map((m, i) => {
          const q = m.mapQuery || m.sourceName || m.title;
          if (!q || q.length < 2) return Promise.resolve(null);
          const areaParam = area ? `&area=${encodeURIComponent(area)}` : "";
          const categoryParam = m.category ? `&category=${encodeURIComponent(m.category)}` : "";
          const addressParam = m.address ? `&address=${encodeURIComponent(m.address)}` : "";
          const sourceParam = `&sourceName=${encodeURIComponent(m.sourceName || q)}`;
          const refreshParam = `&refresh=${encodeURIComponent(`${batchId}-${i}-${q.slice(0, 40)}`)}`;
          return fetch(
            `${SERVER_URL}/place-photo?q=${encodeURIComponent(q)}${areaParam}${categoryParam}${addressParam}${sourceParam}${latParam}${lngParam}${refreshParam}`,
            { cache: "no-store" }
          )
            .then((r) => r.json())
            .then((d) => d.photoUrl ?? null)
            .catch(() => null);
        })
      );
      if (cancelled || myGen !== photoFetchGen.current) return;
      const next: Record<string, string | null> = {};
      snapshot.forEach((m, i) => {
        next[venueKeyForMove(m)] = urls[i] ?? null;
      });
      setPhotoByVenue(next);
    }
    loadPhotos();
    return () => {
      cancelled = true;
    };
  }, [moves, locationLabel, userCoords.lat, userCoords.lng]);

  async function loadMoves() {
    setLoading(true);
    setErrorText("");
    let areaForError = "unknown";

    try {
      const sessionRefresh = Date.now();
      const location = await getReadableLocation();
      const place = location.place || "near you";
      areaForError = place;
      setLocationLabel(place);
      setUserCoords({
        lat: location.lat ?? undefined,
        lng: location.lon ?? undefined,
      });

      const nowIso = new Date().toISOString();
      const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Run grounding and AI expansion in parallel—AI uses its knowledge of real venues
      const [grounding, expandRes] = await Promise.all([
        getAIGrounding({
          area: place,
          lat: location.lat ?? undefined,
          lng: location.lon ?? undefined,
          mood: intent === "don't care" ? "" : intent,
          timeRange,
          currentTime: nowIso,
          hunger,
          preferences,
        }),
        fetch(`${SERVER_URL}/expand-moves`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            area: place,
            timeRange,
            mood: intent === "don't care" ? "" : intent,
            currentTime: nowIso,
            timeZone: deviceTimeZone,
            hunger,
            userContext: buildUserContextLine(preferences),
            refresh: String(sessionRefresh),
          }),
        }).catch(() => null),
      ]);

      let candidates = grounding.candidates;

      function shuffleArr<T>(arr: T[]): T[] {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      }

      function dedupeVenueRows(arr: AICandidate[]): AICandidate[] {
        const seen = new Set<string>();
        const out: AICandidate[] = [];
        for (const c of shuffleArr(arr)) {
          const sn = (c.sourceName || "").toLowerCase().trim();
          const et = (c.exactTitle || "").toLowerCase().trim().slice(0, 80);
          if (!sn && !et) {
            out.push(c);
            continue;
          }
          const key = `${sn}|${et}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(c);
        }
        return out;
      }

      /** Static regional list (la-/nyc-/sf-/oc-) — cap so discovery + AI dominate the feed. */
      function capStaticRegionCurated(arr: AICandidate[], maxStatic: number): AICandidate[] {
        const prefixes = ["la-", "nyc-", "sf-", "oc-"];
        let n = 0;
        return arr.filter((c) => {
          const isStatic = prefixes.some((p) => c.id.startsWith(p));
          if (!isStatic) return true;
          if (n >= maxStatic) return false;
          n += 1;
          return true;
        });
      }

      function interleaveAi(ai: AICandidate[], rest: AICandidate[]): AICandidate[] {
        const out: AICandidate[] = [];
        const n = Math.max(ai.length, rest.length);
        for (let i = 0; i < n; i++) {
          if (i < ai.length) out.push(ai[i]);
          if (i < rest.length) out.push(rest[i]);
        }
        return out;
      }

      // Merge AI suggestions (expand-moves: niche weeknight + activity ideas)
      try {
        const expandData = expandRes?.ok ? await expandRes.json() : null;
        const aiMoves = expandData?.moves ?? [];
        if (Array.isArray(aiMoves) && aiMoves.length > 0) {
          let aiCandidates: AICandidate[] = aiMoves.map((m: any, i: number) => ({
            id: `ai-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            kind: "place" as const,
            suggestionFlavor:
              m.kind === "generic" ? ("activity" as const) : ("named_venue" as const),
            category: m.category || "other",
            exactTitle: m.title ?? `Go to ${m.sourceName ?? "this spot"}`,
            sourceName: m.sourceName ?? "",
            subtitle: m.subtitle ?? "A specific place worth checking out",
            reasonHints: [m.reason ?? "Suggested for your area"],
            durationMinutes: m.durationMinutes ?? 90,
            address: m.address ?? "",
            mapQuery: m.mapQuery ?? m.sourceName ?? m.title ?? "",
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
          if (aiCandidates.length >= 5) {
            const rest = candidates.filter(
              (c) =>
                !c.id.startsWith("la-") &&
                !c.id.startsWith("nyc-") &&
                !c.id.startsWith("sf-") &&
                !c.id.startsWith("oc-")
            );
            candidates = interleaveAi(aiCandidates, rest);
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
        if (isGroceryOrErrandPlace(c.sourceName ?? "", c.exactTitle, c.category)) {
          return false;
        }
        if (
          isLateNightOutHours() &&
          isLateNightInappropriateVenue(c.sourceName ?? "", c.exactTitle, c.category)
        ) {
          return false;
        }
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

      candidates = dedupeVenueRows(candidates);
      candidates = capStaticRegionCurated(candidates, 3);

      const isDiscovered = (c: { id: string }) =>
        c.id.startsWith("overpass-") || c.id.startsWith("place-") || c.id.startsWith("event-");
      const discovered = candidates.filter(isDiscovered);
      const aiFromExpand = candidates.filter((c) => c.id.startsWith("ai-"));
      const notDiscoveredNotAi = candidates.filter(
        (c) => !isDiscovered(c) && !c.id.startsWith("ai-")
      );
      /** If we only used "discovered" here, every ai-* row from /expand-moves was dropped whenever 3+ Places hits existed — same Google list every time. */
      let preferred: AICandidate[];
      if (discovered.length >= 3 && aiFromExpand.length > 0) {
        preferred = [
          ...interleaveAi(shuffleArr(aiFromExpand), shuffleArr(discovered)),
          ...notDiscoveredNotAi,
        ];
      } else if (discovered.length >= 3) {
        preferred = [...discovered, ...notDiscoveredNotAi];
      } else {
        preferred = candidates;
      }

      function rightNowTierClient(c: AICandidate): number {
        if (c.openNow === true) return 4;
        if (c.kind === "event") return 3;
        const cat = (c.category || "").toLowerCase();
        if (["park", "scenic", "trail", "outdoor_event"].includes(cat)) return 2;
        if (c.suggestionFlavor === "activity") return 2;
        return 0;
      }

      function sortRightNowFirst(cands: AICandidate[]): AICandidate[] {
        return [...cands].sort((a, b) => {
          const t = rightNowTierClient(b) - rightNowTierClient(a);
          if (t !== 0) return t;
          const o = (b.openNow === true ? 1 : 0) - (a.openNow === true ? 1 : 0);
          if (o !== 0) return o;
          return (b.score ?? 0) - (a.score ?? 0);
        });
      }

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
            if (Array.isArray(enriched) && enriched.length > 0) preferred = sortRightNowFirst(enriched);
          }
        } catch (_) {
          // enrichment is best-effort
        }
      }

      preferred = sortRightNowFirst(preferred);

      function pickDiverse(cands: typeof candidates, n: number) {
        const ordered = sortRightNowFirst(cands as AICandidate[]);
        const byCategory = new Map<string, typeof candidates>();
        for (const c of ordered) {
          const cat = c.category || "other";
          if (!byCategory.has(cat)) byCategory.set(cat, []);
          byCategory.get(cat)!.push(c);
        }
        for (const [cat, arr] of byCategory.entries()) {
          arr.sort((a, b) => {
            const tr = rightNowTierClient(b as AICandidate) - rightNowTierClient(a as AICandidate);
            if (tr !== 0) return tr;
            return (b.score ?? 0) - (a.score ?? 0);
          });
          byCategory.set(cat, arr);
        }
        const categoryOrder = [
          "bar",
          "nightclub",
          "restaurant",
          "cafe",
          "live_music",
          "comedy",
          "park",
          "scenic",
          "trail",
          "museum",
          "bookstore",
          "gallery",
          "theater",
          "cinema",
          "market",
          "bakery",
          "ice_cream",
        ];
        const categories = Array.from(byCategory.keys()).sort(
          (a, b) =>
            (categoryOrder.indexOf(a) >= 0 ? categoryOrder.indexOf(a) : 99) -
            (categoryOrder.indexOf(b) >= 0 ? categoryOrder.indexOf(b) : 99)
        );
        const picked: typeof candidates = [];
        const maxPerCategory: Record<string, number> = {
          bar: 1,
          museum: 1,
          park: 1,
          scenic: 1,
        };
        let round = 0;
        while (picked.length < n && round < 10) {
          for (const cat of categories) {
            const arr = byCategory.get(cat)!;
            const max = maxPerCategory[cat] ?? 2;
            const alreadyFromCat = picked.filter((p) => (p.category || "other") === cat).length;
            if (alreadyFromCat >= max) continue;
            const available = arr.filter((c) => !picked.includes(c));
            if (available.length === 0) continue;
            const k = Math.min(4, available.length);
            const c = available[Math.floor(Math.random() * k)];
            if (c) {
              picked.push(c);
              if (picked.length >= n) break;
            }
          }
          round++;
        }
        if (picked.length < n) {
          const rest = sortRightNowFirst(
            cands.filter((c) => !picked.includes(c)) as AICandidate[]
          );
          picked.push(...rest.slice(0, n - picked.length));
        }
        return sortRightNowFirst(picked.slice(0, n) as AICandidate[]);
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
            : (c.exactTitle || "A real place near you");
          const subtitle = c.subtitle || hook;
          const reason = sanitizeMoveReason(
            c.reasonHints?.[0] ?? "",
            c.subtitle ||
              `${c.distanceText ?? "Nearby"}. Concrete venue—not a vague night in.`
          );
          return {
          title: venueName,
          subtitle,
          reason,
          durationMinutes: c.durationMinutes ?? 45,
          kind:
            c.suggestionFlavor === "activity"
              ? "generic"
              : c.kind === "event"
                ? "event"
                : "place",
          actionType: c.actionType ?? "maps",
          sourceName: c.sourceName ?? "",
          address: c.address ?? "",
          mapQuery: c.mapQuery ?? "",
          externalUrl: c.externalUrl ?? "",
          distanceText: c.distanceText,
          priceText: c.priceText,
          category: c.category,
          dateText: c.dateText,
          hoursSummary: c.hoursSummary,
          openNow: c.openNow === true,
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
          currentTime: nowIso,
          timeZone: deviceTimeZone,
          hunger,
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
          : (rawTitle || "A real place near you");
        const subtitle =
          typeof m.subtitle === "string" && m.subtitle.length > 0 ? m.subtitle : hook;
        return {
        title: venueName,
        subtitle,
        reason: sanitizeMoveReason(m.reason ?? "", subtitle),
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
        dateText: m.dateText,
        hoursSummary: typeof m.hoursSummary === "string" ? m.hoursSummary : undefined,
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
      <Text style={styles.eyebrow}>Next hour or so</Text>
      <Text style={styles.header}>What are you in the mood for?</Text>
      <Text style={styles.subheader}>
        We lean on what’s open now, same-night stuff, and quick outdoor options when that fits.
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

      <Text style={styles.sectionTitle}>Energy</Text>
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

      <Text style={styles.sectionTitle}>How long do you have?</Text>
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

      <Text style={styles.sectionTitle}>Hungry?</Text>
      <Text style={styles.sectionHint}>
        “Not hungry” dials back restaurants; “Hungry” bumps food up.
      </Text>
      <View style={styles.row}>
        {(
          [
            { value: "any" as const, label: "Either" },
            { value: "hungry" as const, label: "Hungry" },
            { value: "not_hungry" as const, label: "Not hungry" },
          ] as const
        ).map(({ value, label }) => (
          <TouchableOpacity
            key={value}
            style={[styles.choiceButton, hunger === value && styles.choiceButtonActive]}
            onPress={() => setHunger(value)}
          >
            <Text style={[styles.choiceText, hunger === value && styles.choiceTextActive]}>
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
          {loading ? "Looking…" : "Show me ideas"}
        </Text>
      </TouchableOpacity>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Pulling places and tonight’s options near you</Text>
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
          <Text style={styles.emptyTitle}>Tap “Show me ideas” when you’re ready</Text>
          <Text style={styles.emptySub}>
            You’ll get a short list: open spots, shows, and easy outdoor options when they make sense.
          </Text>
        </View>
      )}

      {moves.map((move) => {
        const rowKey = venueKeyForMove(move);
        const heroUrl = photoByVenue[rowKey] ?? null;
        return (
        <Pressable
          key={rowKey}
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
                dateText: move.dateText ?? "",
                userLat:
                  userCoords.lat != null ? String(userCoords.lat) : "",
                userLng:
                  userCoords.lng != null ? String(userCoords.lng) : "",
                hoursSummary: move.hoursSummary ?? "",
                openNow: move.openNow === true ? "true" : "false",
              },
            })
          }
        >
          <View style={styles.cardPhotoWrap}>
            {heroUrl ? (
              <Image
                key={`${rowKey}-${heroUrl}`}
                recyclingKey={`${rowKey}-${heroUrl}`}
                source={{ uri: heroUrl }}
                style={styles.cardPhoto}
                contentFit="cover"
                contentPosition="center"
                cachePolicy="none"
              />
            ) : (
              <View style={styles.cardPhotoPlaceholder}>
                <View style={styles.cardPhotoPlaceholderInner}>
                  <Text style={styles.cardPhotoPlaceholderText}>No photos found</Text>
                </View>
              </View>
            )}
          </View>
          <Text style={styles.cardTitle}>{move.title}</Text>
          <Text style={styles.cardSubtitle}>{move.subtitle}</Text>
          <View style={styles.metaRow}>
            {move.openNow ? (
              <Text style={styles.openNowPill}>Open now</Text>
            ) : null}
            {move.dateText && !move.subtitle.includes(move.dateText) ? (
              <Text style={styles.metaPill}>{move.dateText}</Text>
            ) : null}
            <Text style={styles.metaPill}>{move.durationMinutes} min</Text>
            {move.distanceText ? (
              <Text style={styles.metaPill}>{displayDistanceText(move.distanceText ?? "")}</Text>
            ) : null}
            {move.priceText ? (
              <Text style={styles.metaPill}>{move.priceText}</Text>
            ) : null}
            {move.hoursSummary ? (
              <Text style={styles.metaPill} numberOfLines={2}>
                {move.hoursSummary}
              </Text>
            ) : null}
          </View>
        </Pressable>
        );
      })}
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
    fontWeight: "600",
    letterSpacing: 0,
    color: colors.textSub,
    marginBottom: 8,
  },
  header: {
    fontSize: 34,
    fontWeight: "700",
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
    fontWeight: "600",
    letterSpacing: 0,
    color: colors.textSub,
    marginBottom: 10,
    marginTop: 10,
  },
  sectionHint: {
    fontSize: font.sizeSm,
    color: colors.textMuted,
    opacity: 0.9,
    marginTop: -4,
    marginBottom: 10,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  choiceButton: {
    backgroundColor: colors.bgCard,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceButtonActive: {
    backgroundColor: colors.bgDark,
    borderColor: colors.bgDark,
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
    color: colors.textInverse,
    fontSize: 17,
    fontWeight: "700",
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
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
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
    fontWeight: "500",
    color: colors.textSub,
    backgroundColor: colors.bgCardSoft,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  openNowPill: {
    fontSize: 13,
    fontWeight: "700",
    color: "#166534",
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.35)",
  },
});
}