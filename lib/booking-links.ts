import { Linking } from "react-native";

export type BookingAction = {
  id: string;
  label: string;
  subtitle: string;
  url: string;
};

function enc(s: string) {
  return encodeURIComponent(s.trim());
}

/** Rough guess from suggestion category / Google type string */
export function categorySuggestsReservations(category: string): boolean {
  const c = (category || "").toLowerCase();
  if (!c) return true;
  const foodish =
    /restaurant|cafe|coffee|bar|bakery|food|dining|bistro|brew|wine|breakfast|brunch|lunch|dinner|ice_cream|dessert|meal/.test(
      c
    );
  const never =
    /park|trail|hike|museum|gallery|theat(er|re)|cinema|movie|bookstore|beach|scenic|view|walk|gym|yoga|sport|stadium|comedy|event|market outdoor/.test(
      c
    );
  if (never && !foodish) return false;
  return foodish || /nightclub|night club|lounge|speakeasy/.test(c);
}

function buildSearchQuery(venueName: string, address: string, area: string) {
  const parts = [venueName, address, area].filter((x) => x && x.trim().length > 1);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Ordered one-tap actions: official site & phone first, then third-party reservation search.
 * No API keys — opens the same flows users already use (browser / Maps / dialer).
 */
export function buildBookingActions(opts: {
  venueName: string;
  address?: string;
  area?: string;
  category?: string;
  websiteUri?: string | null;
  phoneNumber?: string | null;
}): BookingAction[] {
  const {
    venueName,
    address = "",
    area = "",
    category = "",
    websiteUri,
    phoneNumber,
  } = opts;
  const q = buildSearchQuery(venueName, address, area);
  const foodish = categorySuggestsReservations(category);

  const actions: BookingAction[] = [];

  if (websiteUri && /^https?:\/\//i.test(websiteUri.trim())) {
    actions.push({
      id: "website",
      label: "Venue website",
      subtitle: "Hours, menus & often a booking link",
      url: websiteUri.trim(),
    });
  }

  if (phoneNumber) {
    const raw = String(phoneNumber).trim();
    const telHref =
      raw.startsWith("+") ? `tel:${raw.replace(/[^\d+]/g, "")}` : `tel:${raw.replace(/\D/g, "")}`;
    if (telHref.length > 5 && /\d/.test(telHref)) {
      actions.push({
        id: "call",
        label: "Call the venue",
        subtitle: "Ask for a table or showtimes",
        url: telHref,
      });
    }
  }

  if (foodish && q.length > 2) {
    actions.push({
      id: "opentable",
      label: "Find on OpenTable",
      subtitle: "Search this spot — book if listed",
      url: `https://www.opentable.com/s/?term=${enc(q)}`,
    });
    actions.push({
      id: "resy",
      label: "Find on Resy",
      subtitle: "Search & book if the restaurant uses Resy",
      url: `https://resy.com/search?query=${enc(q)}`,
    });
  }

  return actions;
}

export async function openBookingUrl(url: string) {
  const supported = await Linking.canOpenURL(url);
  if (supported) await Linking.openURL(url);
}
