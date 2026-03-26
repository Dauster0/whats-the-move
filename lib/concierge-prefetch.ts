import { Image } from "expo-image";
import type { ConciergeSuggestion } from "./concierge-types";
import { cacheConciergeQuickSnapshot, takeCachedConciergeQuick } from "./concierge-quick-cache";
import { getReadableLocation } from "./location";

const SERVER_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.154:3001";

/** Warm the detail /quick response for the top-of-stack cards. */
export async function prefetchConciergeDetailQuick(s: ConciergeSuggestion) {
  if (takeCachedConciergeQuick(s)) return;
  try {
    const loc = await getReadableLocation();
    if (loc.lat == null || loc.lon == null) return;
    const nowIso = new Date().toISOString();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await fetch(`${SERVER_URL}/concierge-detail/quick`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-secret": process.env.EXPO_PUBLIC_APP_SECRET || "" },
      body: JSON.stringify({
        lat: loc.lat,
        lng: loc.lon,
        nowIso,
        timeZone,
        suggestion: s,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !data || typeof data !== "object") return;
    cacheConciergeQuickSnapshot(s, data);
  } catch {
    /* ignore */
  }
}

/** Preload hero images for smoother stack transitions. */
export function prefetchSuggestionHeroImages(urls: (string | null | undefined)[]) {
  for (const u of urls) {
    const s = String(u || "").trim();
    if (s.startsWith("http")) void Image.prefetch(s);
  }
}
